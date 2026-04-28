# BudCam

基于 FastAPI + SQLite + Ant Design + ZLMediaKit + Jessibuca 的简易 ONVIF / RTSP 摄像头监控平台。

## 功能

- 首次访问初始化管理员用户名和密码
- 登录、JWT token 验证、会话超时退出
- 用户管理：添加用户、修改密码、分配摄像头查看权限
- 摄像头管理：手动添加 RTSP，ONVIF 局域网 WS-Discovery 扫描
- 监控大屏：1 / 4 / 6 / 9 分屏
- Docker Compose 部署，支持配置录像路径、ZLMediaKit 端口、Python 端口和前端端口

## 本地部署

```bash
cp .env.example .env
docker compose up -d --build
```

默认访问：

- 前端：http://127.0.0.1:9900
- Python API：http://127.0.0.1:9910
- ZLMediaKit HTTP/WebSocket：http://127.0.0.1:9911

ZLMediaKit 默认开启 `on_play` hook，播放时会回调容器内后端 `http://budcam-api:9910/api/hooks/zlm/on_play`。前端播放器会自动在视频流地址后拼接 `?token=当前用户token`，后端 hook 会校验 token、用户状态和摄像头权限。

ONVIF 局域网扫描优先使用 WS-Discovery 组播。Docker Desktop/macOS 可能收不到局域网 UDP 组播响应，此时可在 `.env` 中配置单播扫描网段作为兜底：

```text
ONVIF_SCAN_TARGETS=10.10.10.0/24
```

也支持逗号分隔的多个目标，例如 `10.10.10.38,10.10.10.50-80,192.168.1.0/24`。

## 开发模式

### 后端开发

```bash
cd backend
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 9910 --reload
```

本地开发模式连接已有 ZLMediaKit 时，只需要修改 `backend/.env`，不需要改 Docker Compose：

```text
BUDCAM_ZLM_API_BASE=http://127.0.0.1:9911
BUDCAM_ZLM_SECRET=budcam
BUDCAM_PUBLIC_ZLM_HOST=127.0.0.1
BUDCAM_PUBLIC_ZLM_HTTP_PORT=9911
BUDCAM_PUBLIC_ZLM_WS_PORT=9911
```

### 前端开发

```bash
cd frontend
cp .env.development.example .env.development
npm install
npm run dev
```

前端开发代理可通过 `frontend/.env.development` 配置：

```text
VITE_DEV_PORT=9900
VITE_API_PROXY_TARGET=http://127.0.0.1:9910
```

## Jessibuca

前端播放器加载 `/jessibuca/jessibuca.js` 和 `/jessibuca/decoder.js`。生产部署前请将 Jessibuca 官方构建文件放到：

```text
frontend/public/jessibuca/jessibuca.js
frontend/public/jessibuca/decoder.js
```

## 配置

复制 `.env.example` 为 `.env` 后可调整：

- `RECORD_PATH`：宿主机录像挂载路径，默认 `./record`，容器内统一挂载到 `/record`
- `RECORD_RETENTION_DAYS`：录像保存天数，`0` 表示不启用录像功能
- `ZLM_HTTP_PORT`：ZLMediaKit HTTP / WebSocket 端口
- `PYTHON_PORT`：后端端口，默认 `9910`
- `FRONTEND_PORT`：前端端口，默认 `9900`
- `PUBLIC_HOST`：浏览器访问 ZLMediaKit 的宿主机 IP 或域名，播放器地址会基于该值生成
- `ONVIF_SCAN_TARGETS`：ONVIF 单播扫描目标，Docker Desktop/macOS 下建议配置摄像头所在网段

## 飞牛OS

`fnos/manifest.json` 已提供应用元信息，`frontend/public/logo.png` 和根目录 `logo.png` 为应用图标。
