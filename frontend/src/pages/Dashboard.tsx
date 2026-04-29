import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Grid, Radio } from 'antd';
import { api, type Camera } from '../api/client';
import { JessibucaPlayer } from '../components/JessibucaPlayer';

const splitCounts = [1, 4, 6, 9];

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
  const [tileOrder, setTileOrder] = useState<number[]>([]);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    api.get('/cameras').then((res) => setCameras(res.data));
  }, []);

  // Sync tileOrder when cameras or split changes (preserves drag-arranged order)
  useEffect(() => {
    const enabledIds = cameras
      .filter((c) => c.enabled)
      .slice(0, split)
      .map((c) => c.id);
    setTileOrder((prev) => {
      const existing = prev.filter((id) => enabledIds.includes(id));
      const added = enabledIds.filter((id) => !prev.includes(id));
      return [...existing, ...added];
    });
  }, [cameras, split]);

  const shown = useMemo(
    () => tileOrder.map((id) => cameras.find((c) => c.id === id)!).filter(Boolean),
    [tileOrder, cameras],
  );

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (targetIndex: number) => {
      const sourceIndex = dragIndexRef.current;
      if (sourceIndex === null || sourceIndex === targetIndex) return;
      setTileOrder((prev) => {
        const next = [...prev];
        [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
        return next;
      });
      dragIndexRef.current = null;
    },
    [],
  );

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
          {shown.map((camera, index) => (
            <div
              key={camera.id}
              className="monitor-tile"
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(index)}
            >
              <JessibucaPlayer title={camera.name} url={withToken(camera.flv_url)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
