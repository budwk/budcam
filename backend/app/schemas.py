from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InitRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(InitRequest):
    pass


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False
    camera_ids: list[int] = []


class PasswordChange(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class UserCameraUpdate(BaseModel):
    camera_ids: list[int]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    camera_ids: list[int] = []


class CameraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    rtsp_url: str | None = Field(default=None, min_length=6, max_length=1024)
    source_type: str = "rtsp"
    onvif_xaddr: str | None = None
    onvif_username: str | None = Field(default=None, max_length=128)
    onvif_password: str | None = Field(default=None, max_length=128)
    onvif_rtsp_path: str | None = Field(default="/stream1", max_length=256)


class CameraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    rtsp_url: str | None = Field(default=None, min_length=6, max_length=1024)
    enabled: bool | None = None


class CameraReorder(BaseModel):
    """Batch reorder payload: list of camera IDs in desired order."""
    ids: list[int]


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    source_type: str
    rtsp_url: str
    onvif_xaddr: str | None
    onvif_username: str | None
    stream_key: str
    enabled: bool
    sort_order: int = 0
    created_at: datetime
    flv_url: str
    ws_flv_url: str


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    camera_id: int
    stream_key: str
    file_path: str
    file_name: str
    file_size: int
    start_time: datetime | None
    duration: int
    created_at: datetime
    play_url: str


class OnvifDevice(BaseModel):
    xaddr: str
    endpoint: str | None = None
    types: str | None = None
    host: str | None = None
    port: int | None = None
