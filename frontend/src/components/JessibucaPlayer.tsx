import { useEffect, useRef, useState } from 'react';

type JessibucaStats = Record<string, number | string | undefined>;

type JessibucaInstance = {
  play: (url: string) => void | Promise<void>;
  destroy: () => void;
  pause?: () => void;
  on?: (event: string, handler: (...args: any[]) => void) => void;
};

declare global {
  interface Window {
    Jessibuca?: new (options: Record<string, unknown>) => JessibucaInstance;
  }
}

function loadJessibuca(): Promise<void> {
  if (window.Jessibuca) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-jessibuca]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Jessibuca 加载失败')));
      return;
    }
    const script = document.createElement('script');
    script.src = '/jessibuca/jessibuca.js';
    script.dataset.jessibuca = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('请将 Jessibuca 构建文件放到 frontend/public/jessibuca/jessibuca.js'));
    document.body.appendChild(script);
  });
}

export function JessibucaPlayer({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<JessibucaInstance | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('初始化');
  const [traffic, setTraffic] = useState('0 KB/s');

  useEffect(() => {
    let disposed = false;
    setError('');
    setStatus('加载播放器');
    setTraffic('0 KB/s');
    loadJessibuca()
      .then(() => {
        if (disposed || !containerRef.current || !window.Jessibuca) return;
        const player = new window.Jessibuca({
          container: containerRef.current,
          videoBuffer: 0.3,
          isResize: true,
          decoder: '/jessibuca/decoder.js',
          hasAudio: true,
          isNotMute: true,
          showBandwidth: true,
          useMSE: true,
          loadingText: '加载视频流...',
          operateBtns: {
            fullscreen: true,
            screenshot: true,
            play: true,
            audio: true,
          },
        });
        playerRef.current = player;
        bindPlayerEvents(player, setStatus, setTraffic, setError);
        setStatus('连接中');
        Promise.resolve(player.play(url)).catch((err) => {
          setError(err?.message || '播放失败');
          setStatus('播放失败');
        });
      })
      .catch((err) => {
        setError(err.message);
        setStatus('播放器加载失败');
      });
    return () => {
      disposed = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [url]);

  return (
    <div className="player-card">
      <div className="player-title">
        <span>{title}</span>
        <span className="player-badge">{status}</span>
      </div>
      <div className="player-canvas" ref={containerRef}>
        {error && (
          <div className="player-error">
            <strong>{error}</strong>
            <span>{url}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function bindPlayerEvents(
  player: JessibucaInstance,
  setStatus: (status: string) => void,
  setTraffic: (traffic: string) => void,
  setError: (error: string) => void,
) {
  player.on?.('play', () => {
    setStatus('播放中');
    setError('');
  });
  player.on?.('pause', () => setStatus('已暂停'));
  player.on?.('load', () => setStatus('加载中'));
  player.on?.('loading', () => setStatus('加载中'));
  player.on?.('timeout', () => {
    setStatus('连接超时');
    setError('视频流连接超时');
  });
  player.on?.('delayTimeout', () => {
    setStatus('延迟过高');
  });
  player.on?.('streamEnd', () => {
    setStatus('流已结束');
    setError('视频流已结束');
  });
  player.on?.('error', (err) => {
    setStatus('播放错误');
    setError(typeof err === 'string' ? err : 'Jessibuca 播放错误，请检查流地址、token、ZLMediaKit on_play 鉴权和解码器文件');
  });
  player.on?.('stats', (stats: JessibucaStats) => {
    setTraffic(formatTraffic(stats));
  });
}

function formatTraffic(stats: JessibucaStats) {
  const value = Number(stats.speed ?? stats.byteSpeed ?? stats.kBps ?? stats.bitrate ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 KB/s';
  if (stats.kBps !== undefined) return `${value.toFixed(1)} KB/s`;
  if (stats.bitrate !== undefined) return `${(value / 1000).toFixed(1)} Kbps`;
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB/s`;
  if (value > 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${value.toFixed(0)} B/s`;
}
