import ipaddress
import re
import select
import socket
import time
import uuid
from urllib.parse import urlparse
from xml.etree import ElementTree

from .schemas import OnvifDevice


DISCOVERY_TARGET = ("239.255.255.250", 3702)

DISCOVERY_MESSAGES = [
    """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://www.w3.org/2005/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{message_id}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </e:Body>
</e:Envelope>""",
    """<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <s:Header>
    <a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>
    <a:MessageID>uuid:{message_id}</a:MessageID>
    <a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>
  </s:Header>
  <s:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </s:Body>
</s:Envelope>""",
]


def _first_text(root: ElementTree.Element, local_name: str) -> str | None:
    for node in root.iter():
        if node.tag.endswith(local_name) and node.text:
            return node.text.strip()
    return None


def scan_onvif(timeout: float = 5.0, probe_count: int = 3, targets: str = "") -> list[OnvifDevice]:
    devices: dict[str, OnvifDevice] = {}
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 0)
        sock.bind(("", 0))

        for _ in range(probe_count):
            for template in DISCOVERY_MESSAGES:
                message = template.format(message_id=uuid.uuid4()).encode()
                sock.sendto(message, DISCOVERY_TARGET)
                for target in _iter_unicast_targets(targets):
                    sock.sendto(message, (target, 3702))
            time.sleep(0.15)

        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(0.1, deadline - time.monotonic())
            readable, _, _ = select.select([sock], [], [], remaining)
            if not readable:
                break
            data, _ = sock.recvfrom(65535)
            try:
                root = ElementTree.fromstring(data)
            except ElementTree.ParseError:
                continue
            xaddrs = _first_text(root, "XAddrs")
            types = _first_text(root, "Types")
            if not types or "NetworkVideoTransmitter" not in types:
                continue
            if not xaddrs:
                continue
            xaddr = re.split(r"\s+", xaddrs)[0]
            parsed = urlparse(xaddr)
            devices[xaddr] = OnvifDevice(
                xaddr=xaddr,
                endpoint=_first_text(root, "Address"),
                types=types,
                host=parsed.hostname,
                port=parsed.port,
            )
    return list(devices.values())


def _iter_unicast_targets(targets: str) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw_target in targets.split(","):
        target = raw_target.strip()
        if not target:
            continue
        try:
            expanded = _expand_target(target)
        except ValueError:
            continue
        for host in expanded:
            if host not in seen:
                seen.add(host)
                result.append(host)
    return result


def _expand_target(target: str) -> list[str]:
    if "-" in target and "/" not in target:
        start, end = target.split("-", 1)
        start_ip = ipaddress.ip_address(start.strip())
        if "." in end:
            end_ip = ipaddress.ip_address(end.strip())
        else:
            parts = start.strip().split(".")
            parts[-1] = end.strip()
            end_ip = ipaddress.ip_address(".".join(parts))
        return [str(ipaddress.ip_address(value)) for value in range(int(start_ip), int(end_ip) + 1)]
    if "/" in target:
        network = ipaddress.ip_network(target, strict=False)
        return [str(host) for host in network.hosts()]
    return [target]
