import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Grid, Radio, Space } from 'antd';
import { api, type Camera } from '../api/client';
import { JessibucaPlayer } from '../components/JessibucaPlayer';

const splitCounts = [1, 4, 6, 9];

function withToken(url: string) {
  const token = localStorage.getItem('budcam_token');
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export function Dashboard({
  fullscreen,
  onFullscreenChange,
}: {
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
}) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [split, setSplit] = useState(4);

  useEffect(() => {
    api.get('/cameras').then((res) => setCameras(res.data));
  }, []);

  const shown = useMemo(() => cameras.filter((camera) => camera.enabled).slice(0, split), [cameras, split]);

  return (
    <section className={`monitor-wall ${isMobile ? 'monitor-wall-mobile' : ''}`}>
      <div className="monitor-head">
        <div className="monitor-title">
          <strong>实时监控</strong>
          <span>{new Date().toLocaleString()}</span>
        </div>
        <div className="monitor-actions">
          <Radio.Group value={split} onChange={(e) => setSplit(e.target.value)}>
            {splitCounts.map((count) => (
              <Radio.Button key={count} value={count}>
                {count} 分屏
              </Radio.Button>
            ))}
          </Radio.Group>
          <Button ghost onClick={() => onFullscreenChange(!fullscreen)}>
            {fullscreen ? '返回' : '全屏'}
          </Button>
        </div>
      </div>
      {shown.length === 0 ? (
        <Empty description="暂无可播放摄像头" />
      ) : (
        <div className={`monitor-grid split-${split} ${isMobile ? 'split-mobile' : ''}`}>
          {shown.map((camera) => (
            <div key={camera.id} className="monitor-tile">
              <JessibucaPlayer title={camera.name} url={withToken(camera.flv_url)} />
            </div>
          ))}
        </div>
      )}
      {cameras.length > split && <Space className="hint">仅显示前 {split} 路，请在摄像头管理中调整排序能力。</Space>}
    </section>
  );
}
