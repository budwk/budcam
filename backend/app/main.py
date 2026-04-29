import asyncio
import hashlib
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .deps import admin_user, current_user
from .models import Camera, Recording, User
from .onvif import scan_onvif
from .schemas import (
    CameraCreate,
    CameraOut,
    CameraReorder,
    CameraUpdate,
    InitRequest,
    LoginRequest,
    PasswordChange,
    RecordingOut,
    TokenResponse,
    UserCameraUpdate,
    UserCreate,
    UserOut,
)
from .security import create_access_token, decode_token, hash_password, verify_password
from .zlm import add_stream_proxy, del_stream_proxy, start_mp4_record, stream_urls

LEGACY_ZLM_RECORDING_PATH = "/record"


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    origins = ["*"] if settings.cors_origins == "*" else [o.strip() for o in settings.cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def startup() -> None:
        if settings.sqlite_path:
            settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        Path(settings.recording_path).mkdir(parents=True, exist_ok=True)
        Base.metadata.create_all(bind=engine)
        _migrate_sqlite()
        _start_cleanup_thread()

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/auth/bootstrap")
    def bootstrap(db: Session = Depends(get_db)) -> dict[str, bool]:
        return {"initialized": db.query(User).count() > 0}

    @app.post("/api/auth/init", response_model=TokenResponse)
    def init(payload: InitRequest, db: Session = Depends(get_db)) -> TokenResponse:
        if db.query(User).count() > 0:
            raise HTTPException(status_code=409, detail="System already initialized")
        user = User(username=payload.username, password_hash=hash_password(payload.password), is_admin=True)
        db.add(user)
        db.commit()
        token, expires = create_access_token(user.username)
        return TokenResponse(access_token=token, expires_in=expires)

    @app.post("/api/auth/login", response_model=TokenResponse)
    def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
        user = db.query(User).filter(User.username == payload.username, User.is_active.is_(True)).first()
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid username or password")
        token, expires = create_access_token(user.username)
        return TokenResponse(access_token=token, expires_in=expires)

    @app.get("/api/auth/me", response_model=UserOut)
    def me(user: User = Depends(current_user)) -> UserOut:
        return _user_out(user)

    @app.get("/api/users", response_model=list[UserOut])
    def list_users(_: User = Depends(admin_user), db: Session = Depends(get_db)) -> list[UserOut]:
        users = db.query(User).options(selectinload(User.cameras)).order_by(User.id).all()
        return [_user_out(user) for user in users]

    @app.post("/api/users", response_model=UserOut)
    def create_user(payload: UserCreate, _: User = Depends(admin_user), db: Session = Depends(get_db)) -> UserOut:
        if db.query(User).filter(User.username == payload.username).first():
            raise HTTPException(status_code=409, detail="Username already exists")
        user = User(
            username=payload.username,
            password_hash=hash_password(payload.password),
            is_admin=payload.is_admin,
        )
        user.cameras = db.query(Camera).filter(Camera.id.in_(payload.camera_ids)).all() if payload.camera_ids else []
        db.add(user)
        db.commit()
        db.refresh(user)
        return _user_out(user)

    @app.put("/api/users/{user_id}/password")
    def change_password(
        user_id: int,
        payload: PasswordChange,
        me_user: User = Depends(current_user),
        db: Session = Depends(get_db),
    ) -> dict[str, str]:
        if not me_user.is_admin and me_user.id != user_id:
            raise HTTPException(status_code=403, detail="Cannot change another user's password")
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.password_hash = hash_password(payload.password)
        db.commit()
        return {"status": "ok"}

    @app.put("/api/users/{user_id}/cameras", response_model=UserOut)
    def assign_cameras(user_id: int, payload: UserCameraUpdate, _: User = Depends(admin_user), db: Session = Depends(get_db)) -> UserOut:
        user = db.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.cameras = db.query(Camera).filter(Camera.id.in_(payload.camera_ids)).all() if payload.camera_ids else []
        db.commit()
        db.refresh(user)
        return _user_out(user)

    @app.get("/api/cameras", response_model=list[CameraOut])
    def list_cameras(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[CameraOut]:
        query = db.query(Camera).order_by(Camera.sort_order, Camera.id)
        if not user.is_admin:
            query = query.join(Camera.users).filter(User.id == user.id)
        return [_camera_out(camera) for camera in query.all()]

    @app.post("/api/cameras", response_model=CameraOut)
    async def create_camera(payload: CameraCreate, _: User = Depends(admin_user), db: Session = Depends(get_db)) -> CameraOut:
        rtsp_url = _resolve_camera_rtsp_url(payload)
        stream_key = _stream_key(payload.name, rtsp_url)
        max_order = db.query(Camera.sort_order).order_by(Camera.sort_order.desc()).first()
        camera = Camera(
            name=payload.name,
            rtsp_url=rtsp_url,
            source_type=payload.source_type,
            sort_order=(max_order[0] + 1) if max_order else 0,
            onvif_xaddr=payload.onvif_xaddr,
            onvif_username=payload.onvif_username,
            onvif_password=payload.onvif_password,
            onvif_rtsp_path=payload.onvif_rtsp_path,
            stream_key=stream_key,
        )
        db.add(camera)
        db.commit()
        db.refresh(camera)
        await _safe_add_proxy(camera)
        if settings.record_retention_days > 0:
            await _safe_start_record(camera)
        return _camera_out(camera)

    @app.put("/api/cameras/reorder", response_model=list[CameraOut])
    async def reorder_cameras(
        payload: CameraReorder, _: User = Depends(admin_user), db: Session = Depends(get_db)
    ) -> list[CameraOut]:
        cameras = {c.id: c for c in db.query(Camera).filter(Camera.id.in_(payload.ids)).all()}
        for order, cam_id in enumerate(payload.ids):
            camera = cameras.get(cam_id)
            if camera:
                camera.sort_order = order
        db.commit()
        return [_camera_out(cameras[cam_id]) for cam_id in payload.ids if cam_id in cameras]

    @app.put("/api/cameras/{camera_id}", response_model=CameraOut)
    async def update_camera(camera_id: int, payload: CameraUpdate, _: User = Depends(admin_user), db: Session = Depends(get_db)) -> CameraOut:
        camera = db.get(Camera, camera_id)
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")
        old_url = camera.rtsp_url
        if payload.name is not None:
            camera.name = payload.name
        if payload.rtsp_url is not None:
            camera.rtsp_url = payload.rtsp_url
        if payload.enabled is not None:
            camera.enabled = payload.enabled
        db.commit()
        db.refresh(camera)
        if camera.enabled and camera.rtsp_url != old_url:
            await _safe_add_proxy(camera)
            if settings.record_retention_days > 0:
                await _safe_start_record(camera)
        return _camera_out(camera)

    @app.delete("/api/cameras/{camera_id}")
    async def delete_camera(camera_id: int, _: User = Depends(admin_user), db: Session = Depends(get_db)) -> dict[str, str]:
        camera = db.get(Camera, camera_id)
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")
        await _safe_del_proxy(camera)
        db.delete(camera)
        db.commit()
        return {"status": "ok"}

    @app.post("/api/cameras/{camera_id}/start")
    async def start_camera(camera_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, str]:
        camera = _get_authorized_camera(db, user, camera_id)
        await _safe_add_proxy(camera)
        if settings.record_retention_days > 0:
            await _safe_start_record(camera)
        return {"status": "ok"}

    @app.get("/api/cameras/{camera_id}/recordings", response_model=list[RecordingOut])
    def list_recordings(camera_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[RecordingOut]:
        _get_authorized_camera(db, user, camera_id)
        recordings = (
            db.query(Recording)
            .filter(Recording.camera_id == camera_id)
            .order_by(Recording.start_time.desc().nullslast(), Recording.created_at.desc())
            .all()
        )
        return [_recording_out(recording) for recording in recordings]

    @app.get("/api/recordings/{recording_id}/play")
    def play_recording(recording_id: int, token: str, db: Session = Depends(get_db)):
        user = _user_from_token(db, token)
        recording = db.get(Recording, recording_id)
        if not recording:
            raise HTTPException(status_code=404, detail="Recording not found")
        _get_authorized_camera(db, user, recording.camera_id)
        record_path = _existing_record_path(recording.file_path)
        if not record_path:
            raise HTTPException(status_code=404, detail="Recording file not found")
        return FileResponse(record_path, media_type="video/mp4", filename=recording.file_name)

    @app.get("/api/onvif/scan")
    async def onvif_scan(_: User = Depends(admin_user)):
        return await asyncio.to_thread(scan_onvif, targets=settings.onvif_scan_targets)

    @app.post("/api/hooks/zlm/on_play")
    async def zlm_on_play(request: Request, db: Session = Depends(get_db)) -> dict[str, int | str]:
        payload = await request.json()
        stream_key = payload.get("stream")
        token = _extract_play_token(payload.get("params"))
        if not stream_key or not token:
            return _zlm_reject("Missing stream or token")

        username = decode_token(token)
        if not username:
            return _zlm_reject("Invalid or expired token")

        user = db.query(User).filter(User.username == username, User.is_active.is_(True)).first()
        camera = db.query(Camera).filter(Camera.stream_key == stream_key, Camera.enabled.is_(True)).first()
        if not user or not camera:
            return _zlm_reject("User or stream not found")
        if not user.is_admin and camera not in user.cameras:
            return _zlm_reject("No camera permission")
        return {"code": 0, "msg": "success"}

    @app.post("/api/hooks/zlm/on_record_mp4")
    async def zlm_on_record_mp4(request: Request, db: Session = Depends(get_db)) -> dict[str, int | str]:
        payload = await request.json()
        stream_key = payload.get("stream")
        camera = db.query(Camera).filter(Camera.stream_key == stream_key).first()
        if not camera:
            return {"code": 0, "msg": "camera not managed"}
        raw_file_path = _record_file_path(payload)
        if not raw_file_path:
            return _zlm_reject("Missing record file path")
        file_path = _normalize_record_path(raw_file_path)
        file_name = payload.get("file_name") or Path(raw_file_path).name
        file_size = _int_value(payload.get("file_size") or payload.get("fileSize") or _safe_file_size(file_path))
        start_time = _parse_record_time(payload.get("start_time") or payload.get("startTime"))
        duration = _int_value(payload.get("time_len") or payload.get("timeLen") or payload.get("duration"))
        candidates = [str(path) for path in _candidate_record_paths(raw_file_path)]
        recording = db.query(Recording).filter(Recording.file_path.in_(candidates)).first()
        if not recording:
            recording = Recording(
                camera_id=camera.id,
                stream_key=camera.stream_key,
                file_path=file_path,
                file_name=file_name,
            )
            db.add(recording)
        else:
            recording.file_path = file_path
        recording.file_size = file_size
        recording.start_time = start_time
        recording.duration = duration
        db.commit()
        return {"code": 0, "msg": "success"}

    return app


def _stream_key(name: str, url: str) -> str:
    digest = hashlib.sha1(f"{name}:{url}".encode()).hexdigest()[:10]
    return f"cam_{digest}"


def _resolve_camera_rtsp_url(payload: CameraCreate) -> str:
    if payload.rtsp_url:
        return payload.rtsp_url
    if payload.source_type != "onvif" or not payload.onvif_xaddr:
        raise HTTPException(status_code=422, detail="RTSP URL is required")
    parsed = urlparse(payload.onvif_xaddr)
    if not parsed.hostname:
        raise HTTPException(status_code=422, detail="Invalid ONVIF device address")
    username = quote(payload.onvif_username or "", safe="")
    password = quote(payload.onvif_password or "", safe="")
    auth = f"{username}:{password}@" if username or password else ""
    path = payload.onvif_rtsp_path or "/stream1"
    if not path.startswith("/"):
        path = f"/{path}"
    return f"rtsp://{auth}{parsed.hostname}:554{path}"


def _camera_out(camera: Camera) -> CameraOut:
    flv_url, ws_flv_url = stream_urls(camera)
    return CameraOut(
        id=camera.id,
        name=camera.name,
        source_type=camera.source_type,
        rtsp_url=camera.rtsp_url,
        onvif_xaddr=camera.onvif_xaddr,
        onvif_username=camera.onvif_username,
        stream_key=camera.stream_key,
        enabled=camera.enabled,
        sort_order=camera.sort_order,
        created_at=camera.created_at,
        flv_url=flv_url,
        ws_flv_url=ws_flv_url,
    )


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        camera_ids=[camera.id for camera in user.cameras],
    )


def _get_authorized_camera(db: Session, user: User, camera_id: int) -> Camera:
    query = db.query(Camera).filter(Camera.id == camera_id)
    if not user.is_admin:
        query = query.join(Camera.users).filter(User.id == user.id)
    camera = query.first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


def _user_from_token(db: Session, token: str) -> User:
    username = decode_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.username == username, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _extract_play_token(params: str | None) -> str | None:
    if not params:
        return None
    normalized = params[1:] if params.startswith("?") else params
    values = parse_qs(normalized).get("token")
    return values[0] if values else None


def _zlm_reject(message: str) -> dict[str, int | str]:
    return {"code": -1, "msg": message}


def _recording_out(recording: Recording) -> RecordingOut:
    return RecordingOut(
        id=recording.id,
        camera_id=recording.camera_id,
        stream_key=recording.stream_key,
        file_path=_normalize_record_path(recording.file_path),
        file_name=recording.file_name,
        file_size=recording.file_size,
        start_time=recording.start_time,
        duration=recording.duration,
        created_at=recording.created_at,
        play_url=f"/api/recordings/{recording.id}/play",
    )


def _record_file_path(payload: dict) -> str | None:
    file_path = payload.get("file_path") or payload.get("filePath")
    file_name = payload.get("file_name") or payload.get("fileName")
    if file_path and file_name and Path(file_path).is_dir():
        return str(Path(file_path) / file_name)
    return file_path or payload.get("file")


def _normalize_record_path(file_path: str) -> str:
    record_path = Path(file_path)
    try:
        relative = record_path.relative_to(LEGACY_ZLM_RECORDING_PATH)
    except ValueError:
        return file_path
    return str(Path(settings.recording_path) / relative)


def _candidate_record_paths(file_path: str) -> list[Path]:
    normalized = Path(_normalize_record_path(file_path))
    candidates: list[Path] = []
    for candidate in (normalized, Path(file_path)):
        if candidate not in candidates:
            candidates.append(candidate)
    try:
        relative = normalized.relative_to(settings.recording_path)
    except ValueError:
        return candidates
    legacy = Path(LEGACY_ZLM_RECORDING_PATH) / relative
    if legacy not in candidates:
        candidates.append(legacy)
    return candidates


def _existing_record_path(file_path: str) -> Path | None:
    for candidate in _candidate_record_paths(file_path):
        if candidate.is_file():
            return candidate
    return None


def _parse_record_time(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return datetime.fromtimestamp(int(stripped), tz=timezone.utc)
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d_%H-%M-%S"):
            try:
                return datetime.strptime(stripped, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                pass
    return None


def _int_value(value) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def _safe_file_size(file_path: str) -> int:
    existing_path = _existing_record_path(file_path)
    if not existing_path:
        return 0
    try:
        return os.path.getsize(existing_path)
    except OSError:
        return 0


def _start_cleanup_thread() -> None:
    if settings.record_retention_days <= 0:
        return
    thread = threading.Thread(target=_cleanup_loop, daemon=True)
    thread.start()


def _cleanup_loop() -> None:
    while True:
        now = datetime.now()
        next_run = now.replace(hour=1, minute=0, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
        time.sleep(max(1, (next_run - now).total_seconds()))
        _cleanup_expired_recordings()


def _cleanup_expired_recordings() -> None:
    if settings.record_retention_days <= 0:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.record_retention_days)
    db = SessionLocal()
    try:
        expired = db.query(Recording).all()
        for recording in expired:
            record_time = recording.start_time or recording.created_at
            if record_time >= cutoff:
                continue
            for path in _candidate_record_paths(recording.file_path):
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            db.delete(recording)
        db.commit()
    finally:
        db.close()


def _migrate_sqlite() -> None:
    if not settings.database_url.startswith("sqlite"):
        return
    inspector = inspect(engine)
    if "cameras" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("cameras")}
    alters = []
    if "onvif_username" not in columns:
        alters.append("ALTER TABLE cameras ADD COLUMN onvif_username VARCHAR(128)")
    if "onvif_password" not in columns:
        alters.append("ALTER TABLE cameras ADD COLUMN onvif_password VARCHAR(128)")
    if "onvif_rtsp_path" not in columns:
        alters.append("ALTER TABLE cameras ADD COLUMN onvif_rtsp_path VARCHAR(256)")
    if "sort_order" not in columns:
        alters.append("ALTER TABLE cameras ADD COLUMN sort_order INTEGER DEFAULT 0")
    if not alters:
        return
    with engine.begin() as connection:
        for statement in alters:
            connection.execute(text(statement))


async def _safe_add_proxy(camera: Camera) -> None:
    try:
        await add_stream_proxy(camera)
    except Exception:
        pass


async def _safe_del_proxy(camera: Camera) -> None:
    try:
        await del_stream_proxy(camera)
    except Exception:
        pass


async def _safe_start_record(camera: Camera) -> None:
    try:
        await start_mp4_record(camera)
    except Exception:
        pass


app = create_app()
