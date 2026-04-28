import httpx

from .config import settings
from .models import Camera


def stream_urls(camera: Camera) -> tuple[str, str]:
    app = "live"
    stream = camera.stream_key
    host = settings.public_zlm_host
    http_port = settings.public_zlm_http_port
    ws_port = settings.public_zlm_ws_port
    return (
        f"http://{host}:{http_port}/{app}/{stream}.live.flv",
        f"ws://{host}:{ws_port}/{app}/{stream}.live.flv",
    )


async def add_stream_proxy(camera: Camera) -> None:
    params = {
        "secret": settings.zlm_secret,
        "vhost": "__defaultVhost__",
        "app": "live",
        "stream": camera.stream_key,
        "url": camera.rtsp_url,
        "enable_rtsp": 1,
        "enable_rtmp": 1,
        "enable_hls": 1,
        "enable_mp4": 1,
    }
    async with httpx.AsyncClient(timeout=8) as client:
        await client.get(f"{settings.zlm_api_base}/index/api/addStreamProxy", params=params)


async def del_stream_proxy(camera: Camera) -> None:
    params = {"secret": settings.zlm_secret, "key": f"__defaultVhost__/live/{camera.stream_key}"}
    async with httpx.AsyncClient(timeout=5) as client:
        await client.get(f"{settings.zlm_api_base}/index/api/delStreamProxy", params=params)


async def start_mp4_record(camera: Camera) -> None:
    params = {
        "secret": settings.zlm_secret,
        "type": 1,
        "vhost": "__defaultVhost__",
        "app": "live",
        "stream": camera.stream_key,
        "customized_path": settings.recording_path,
        "max_second": 3600,
    }
    async with httpx.AsyncClient(timeout=8) as client:
        await client.get(f"{settings.zlm_api_base}/index/api/startRecord", params=params)
