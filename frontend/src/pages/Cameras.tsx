import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Spin, Steps, Switch, Table, Tag, message } from 'antd';
import { Grid } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, type Camera, type OnvifDevice, type Recording } from '../api/client';
import { JessibucaPlayer } from '../components/JessibucaPlayer';

function withToken(url: string) {
  const token = localStorage.getItem('budcam_token');
  // 替换 ZLM 地址为代理地址
    let processedUrl = url;

    // 匹配 http://IP:PORT/live/ 或 http://127.0.0.1:9911/live/ 格式
    const zlmPattern = /^https?:\/\/[^/]+\/live\//;
    if (zlmPattern.test(processedUrl)) {
      // 获取当前浏览器的协议、域名和端口
      const currentProtocol = window.location.protocol;
      const currentHost = window.location.host;

      // 替换为代理路径
      processedUrl = processedUrl.replace(
        /^https?:\/\/[^/]+(\/live\/.*)$/,
        `${currentProtocol}//${currentHost}/zlm$1`
      );
    }
  if (!token) return processedUrl;
  return `${processedUrl}${processedUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export function Cameras({ isAdmin }: { isAdmin: boolean }) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [open, setOpen] = useState(false);
  const [onvifOpen, setOnvifOpen] = useState(false);
  const [onvifStep, setOnvifStep] = useState(0);
  const [devices, setDevices] = useState<OnvifDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<OnvifDevice | null>(null);
  const [playingCamera, setPlayingCamera] = useState<Camera | null>(null);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [recordingCamera, setRecordingCamera] = useState<Camera | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingVideo, setRecordingVideo] = useState<Recording | null>(null);
  const [playLoadingId, setPlayLoadingId] = useState<number | null>(null);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [onvifForm] = Form.useForm();

  const load = () => api.get('/cameras').then((res) => setCameras(res.data));

  useEffect(() => {
    load();
  }, []);

  const add = async (values: { name: string; rtsp_url: string; source_type?: string; onvif_xaddr?: string }) => {
    await api.post('/cameras', { ...values, source_type: values.source_type || 'rtsp' });
    message.success('摄像头已添加');
    setOpen(false);
    form.resetFields();
    load();
  };

  const scan = async () => {
    setDevices([]);
    setSelectedDevice(null);
    setOnvifStep(0);
    setOnvifOpen(true);
    setScanLoading(true);
    try {
      const res = await api.get('/onvif/scan');
      setDevices(res.data);
      if (res.data.length === 0) {
        message.info('未扫描到 ONVIF 设备');
      }
    } finally {
      setScanLoading(false);
    }
  };

  const addOnvif = async (values: { name: string; username?: string; password?: string; rtsp_path?: string }) => {
    if (!selectedDevice) return;
    await api.post('/cameras', {
      name: values.name,
      source_type: 'onvif',
      onvif_xaddr: selectedDevice.xaddr,
      onvif_username: values.username,
      onvif_password: values.password,
      onvif_rtsp_path: values.rtsp_path || '/stream1',
    });
    message.success('ONVIF 摄像头已添加');
    setOnvifOpen(false);
    setSelectedDevice(null);
    onvifForm.resetFields();
    load();
  };

  const nextOnvifStep = () => {
    if (!selectedDevice) {
      message.warning('请选择一个待添加的 ONVIF 设备');
      return;
    }
    onvifForm.setFieldsValue({
      name: selectedDevice.host || selectedDevice.xaddr,
      username: '',
      password: '',
      rtsp_path: '/stream1',
    });
    setOnvifStep(1);
  };

  const isAdded = (device: OnvifDevice) => cameras.some((camera) => camera.onvif_xaddr === device.xaddr);

  const play = async (camera: Camera) => {
    setPlayLoadingId(camera.id);
    try {
      await api.post(`/cameras/${camera.id}/start`);
      setPlayingCamera(camera);
    } catch (err: any) {
      message.error(err.response?.data?.detail || '启动播放失败');
    } finally {
      setPlayLoadingId(null);
    }
  };

  const openEdit = (camera: Camera) => {
    setEditingCamera(camera);
    editForm.setFieldsValue({
      name: camera.name,
      rtsp_url: camera.rtsp_url,
      enabled: camera.enabled,
    });
  };

  const updateCamera = async (values: { name: string; rtsp_url: string; enabled: boolean }) => {
    if (!editingCamera) return;
    const res = await api.put(`/cameras/${editingCamera.id}`, values);
    message.success('摄像头已更新');
    setEditingCamera(null);
    editForm.resetFields();
    setCameras((items) => items.map((item) => (item.id === res.data.id ? res.data : item)));
    if (playingCamera?.id === res.data.id) {
      setPlayingCamera(res.data);
    }
  };

  const openRecordings = async (camera: Camera) => {
    setRecordingCamera(camera);
    setRecordings([]);
    setRecordingsLoading(true);
    try {
      const res = await api.get(`/cameras/${camera.id}/recordings`);
      setRecordings(res.data);
    } finally {
      setRecordingsLoading(false);
    }
  };

  const recordingUrl = (recording: Recording) => {
    const token = localStorage.getItem('budcam_token') || '';
    return `${recording.play_url}?token=${encodeURIComponent(token)}`;
  };

  const columns: ColumnsType<Camera> = [
    { title: '名称', dataIndex: 'name' },
    { title: '来源', dataIndex: 'source_type', render: (v) => <Tag>{v.toUpperCase()}</Tag> },
    { title: 'RTSP', dataIndex: 'rtsp_url', ellipsis: true },
    { title: '播放地址', dataIndex: 'flv_url', ellipsis: true },
    { title: '状态', dataIndex: 'enabled', render: (v) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
    {
        title: '操作',
        render: (_, record) => (
        <Space wrap>
          <Button size="small" type="primary" loading={playLoadingId === record.id} onClick={() => play(record)}>
            播放
          </Button>
          <Button size="small" onClick={() => openRecordings(record)}>
            录像
          </Button>
          {isAdmin && (
            <>
              <Button size="small" onClick={() => openEdit(record)}>
                修改
              </Button>
              <Popconfirm title="删除该摄像头？" onConfirm={() => api.delete(`/cameras/${record.id}`).then(load)}>
                <Button danger size="small">
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const renderCameraActions = (camera: Camera) => (
    <div className="entity-actions">
      <Button type="primary" loading={playLoadingId === camera.id} onClick={() => play(camera)}>
        播放
      </Button>
      <Button onClick={() => openRecordings(camera)}>录像</Button>
      {isAdmin && (
        <>
          <Button onClick={() => openEdit(camera)}>修改</Button>
          <Popconfirm title="删除该摄像头？" onConfirm={() => api.delete(`/cameras/${camera.id}`).then(load)}>
            <Button danger>删除</Button>
          </Popconfirm>
        </>
      )}
    </div>
  );

  return (
    <section>
      <div className="section-head">
        <h2>摄像头管理</h2>
        {isAdmin && (
          <div className="section-actions">
            <Button onClick={scan} loading={scanLoading}>ONVIF 局域网扫描</Button>
            <Button type="primary" onClick={() => setOpen(true)}>
              手动添加 RTSP
            </Button>
          </div>
        )}
      </div>
      {isMobile ? (
        <div className="responsive-card-list">
          {cameras.map((camera) => (
            <article key={camera.id} className="entity-card">
              <div className="entity-card-head">
                <div>
                  <h3>{camera.name}</h3>
                  <div className="entity-card-subtitle">来源：{camera.source_type.toUpperCase()}</div>
                </div>
                {camera.enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>}
              </div>
              <div className="entity-fields">
                <div className="entity-field">
                  <span className="entity-label">RTSP 地址</span>
                  <span className="entity-value">{camera.rtsp_url}</span>
                </div>
                <div className="entity-field">
                  <span className="entity-label">播放地址</span>
                  <span className="entity-value">{camera.flv_url}</span>
                </div>
              </div>
              {renderCameraActions(camera)}
            </article>
          ))}
        </div>
      ) : (
        <Table rowKey="id" columns={columns} dataSource={cameras} scroll={{ x: 960 }} />
      )}
      <Modal
        title="添加摄像头"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Form form={form} layout="vertical" onFinish={add}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="rtsp_url" label="RTSP 地址" rules={[{ required: true }]}>
            <Input placeholder="rtsp://user:password@192.168.1.10:554/stream1" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="添加 ONVIF 摄像头"
        open={onvifOpen}
        onCancel={() => setOnvifOpen(false)}
        width={isMobile ? 'calc(100vw - 24px)' : 920}
        destroyOnClose
        footer={
          onvifStep === 0
            ? [
                <Button key="cancel" onClick={() => setOnvifOpen(false)}>
                  取消
                </Button>,
                <Button key="manual" onClick={() => { setOnvifOpen(false); setOpen(true); }}>
                  手动添加 RTSP
                </Button>,
                <Button key="next" type="primary" onClick={nextOnvifStep}>
                  下一步
                </Button>,
              ]
            : [
                <Button key="back" onClick={() => setOnvifStep(0)}>
                  上一步
                </Button>,
                <Button key="cancel" onClick={() => setOnvifOpen(false)}>
                  取消
                </Button>,
                <Button key="submit" type="primary" onClick={() => onvifForm.submit()}>
                  添加
                </Button>,
              ]
        }
      >
        <Steps
          current={onvifStep}
          items={[
            { title: '选择设备' },
            { title: '输入账号' },
          ]}
          className="camera-steps"
        />
        {onvifStep === 0 ? (
          <>
            <Alert
              type={scanLoading ? 'info' : devices.length === 0 ? 'warning' : 'info'}
              showIcon
              message={
                scanLoading
                  ? '搜索中，正在通过 WS-Discovery 扫描局域网 ONVIF 设备...'
                  : devices.length === 0
                    ? '未扫描到设备。Docker Desktop/macOS 环境可能收不到局域网 UDP 组播响应，可使用“手动添加 RTSP”。'
                    : '请选择一个待添加的 ONVIF 设备。若列表没有目标设备，可点击底部“手动添加 RTSP”。'
              }
              className="modal-alert"
            />
            <Spin spinning={scanLoading} tip="搜索中">
              <Table
                rowKey="xaddr"
                loading={scanLoading}
                dataSource={devices}
                scroll={{ x: 720 }}
                locale={{ emptyText: scanLoading ? '搜索中...' : '暂无待添加 ONVIF 设备' }}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedDevice ? [selectedDevice.xaddr] : [],
                  getCheckboxProps: (device) => ({ disabled: isAdded(device) }),
                  onSelect: (device) => setSelectedDevice(device),
                }}
                columns={[
                  { title: '品牌', render: () => 'ONVIF' },
                  { title: '型号', render: () => 'NetworkVideoTransmitter' },
                  { title: '摄像机地址', dataIndex: 'host', render: (_, device) => device.host || device.xaddr },
                  { title: '端口', dataIndex: 'port', render: (_, device) => device.port || 80 },
                  { title: 'Endpoint', dataIndex: 'endpoint', ellipsis: true },
                  {
                    title: '状态',
                    render: (_, device) => (isAdded(device) ? <Tag>已添加</Tag> : <Tag color="green">待添加</Tag>),
                  },
                ]}
              />
            </Spin>
          </>
        ) : (
          <Form form={onvifForm} layout="vertical" onFinish={addOnvif}>
            <Alert
              type="warning"
              showIcon
              message="不同厂商的 RTSP 路径可能不同。默认使用 /stream1，如果添加后无法播放，请改为摄像头实际 RTSP 路径或使用手动 RTSP 添加。"
              className="modal-alert"
            />
            <Form.Item label="ONVIF 地址">
              <Input value={selectedDevice?.xaddr} disabled />
            </Form.Item>
            <Form.Item name="name" label="摄像头名称" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="username" label="摄像头用户名">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item name="password" label="摄像头密码">
              <Input.Password autoComplete="new-password" />
            </Form.Item>
            <Form.Item name="rtsp_path" label="RTSP 路径" rules={[{ required: true }]}>
              <Input placeholder="/stream1" />
            </Form.Item>
          </Form>
        )}
      </Modal>
      <Modal
        title={`修改摄像头：${editingCamera?.name || ''}`}
        open={!!editingCamera}
        onCancel={() => setEditingCamera(null)}
        onOk={() => editForm.submit()}
        destroyOnClose
        width={isMobile ? 'calc(100vw - 24px)' : 520}
      >
        <Form form={editForm} layout="vertical" onFinish={updateCamera}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="rtsp_url" label="RTSP 地址" rules={[{ required: true }]}>
            <Input placeholder="rtsp://user:password@192.168.1.10:554/stream1" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`播放：${playingCamera?.name || ''}`}
        open={!!playingCamera}
        onCancel={() => setPlayingCamera(null)}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 980}
        destroyOnClose
      >
        {playingCamera && (
          <div className="camera-preview">
            <JessibucaPlayer title={playingCamera.name} url={withToken(playingCamera.flv_url)} />
          </div>
        )}
      </Modal>
      <Modal
        title={`录像：${recordingCamera?.name || ''}`}
        open={!!recordingCamera}
        onCancel={() => {
          setRecordingCamera(null);
          setRecordingVideo(null);
        }}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 980}
        destroyOnClose
      >
        <Table
          rowKey="id"
          loading={recordingsLoading}
          dataSource={recordings}
          scroll={{ x: 720 }}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: '文件路径', dataIndex: 'file_path', ellipsis: true },
            { title: '时间', dataIndex: 'start_time', render: (_, row) => formatBeijingTime(row.start_time || row.created_at) },
            { title: '时长', dataIndex: 'duration', render: (v) => `${v || 0}s` },
            { title: '大小', dataIndex: 'file_size', render: (v) => formatFileSize(v) },
            {
              title: '操作',
              render: (_, row) => (
                <Button size="small" type="primary" onClick={() => setRecordingVideo(row)}>
                  播放
                </Button>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        title={`播放录像：${recordingVideo?.file_name || ''}`}
        open={!!recordingVideo}
        onCancel={() => setRecordingVideo(null)}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 900}
        destroyOnClose
      >
        {recordingVideo && <video className="recording-video" src={recordingUrl(recordingVideo)} controls autoPlay />}
      </Modal>
    </section>
  );
}

function formatBeijingTime(dt: string) {
  if (!dt) return '-';
  return new Date(dt).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatFileSize(size: number) {
  if (!size) return '0 B';
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}
