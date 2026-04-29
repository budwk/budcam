# BudCam — 轻量级摄像头监控平台

基于 ONVIF/RTSP 的摄像头监控系统，支持多路实时监控大屏、录像回放与用户权限管理。

## 快速部署

```bash
# 1. 创建目录
mkdir budcam && cd budcam

# 2. 下载 docker-compose.yml
curl -LO https://raw.githubusercontent.com/YOUR_GITHUB/budcam/main/docker-compose.release.yml

# 3. 创建 ZLMediaKit 配置目录
mkdir -p docker/zlmediakit
cat > docker/zlmediakit/config.ini << 'EOF'
[api]
secret=budcam

[general]
enableVhost=0

[http]
port=9911

[rtsp]
port=9554

[rtmp]
port=9935

[hook]
enable=1
on_play=http://budcam-api:9910/api/hooks/zlm/on_play
on_record_mp4=http://budcam-api:9910/api/hooks/zlm/on_record_mp4

[record]
filePath=/record
fileSecond=1800
EOF

# 4. 启动
DOCKER_USER=yourusername docker compose -f docker-compose.release.yml up -d

# 5. 访问 http://NAS_IP:9900
```

## 功能

- **ONVIF 局域网扫描** — 自动发现局域网中的 ONVIF 摄像头
- **RTSP 手动添加** — 支持任意 RTSP 摄像头
- **多路监控大屏** — 1/4/6/9 分屏，全屏模式
- **录像回放** — 自动录制并支持 MP4 回放
- **用户权限管理** — 支持多用户、摄像头权限分配
- **PWA 界面** — 基于 React + Ant Design，适配移动端

## 端口

| 端口  | 服务           |
|-------|----------------|
| 9900  | Web 管理界面   |
| 9910  | API 后端       |
| 9911  | ZLMediaKit HTTP |
| 9554  | RTSP 流        |
| 9935  | RTMP 流        |

## 从源码构建

```bash
git clone https://github.com/YOUR_GITHUB/budcam.git
cd budcam

# 开发模式（源码构建）
docker compose up -d

# 或者手动构建镜像
docker build -t budcam-api ./backend
docker build -t budcam-web ./frontend

# 发布到 Docker Hub
DOCKER_USER=yourusername bash scripts/publish.sh
```

## 许可证

MIT
