from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


user_cameras = Table(
    "user_cameras",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("camera_id", ForeignKey("cameras.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    cameras: Mapped[list["Camera"]] = relationship(secondary=user_cameras, back_populates="users")


class Camera(Base):
    __tablename__ = "cameras"
    __table_args__ = (UniqueConstraint("stream_key", name="uq_camera_stream_key"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    source_type: Mapped[str] = mapped_column(String(16), default="rtsp")
    rtsp_url: Mapped[str] = mapped_column(String(1024))
    onvif_xaddr: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    onvif_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    onvif_password: Mapped[str | None] = mapped_column(String(128), nullable=True)
    onvif_rtsp_path: Mapped[str | None] = mapped_column(String(256), nullable=True)
    stream_key: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    users: Mapped[list[User]] = relationship(secondary=user_cameras, back_populates="cameras")
    recordings: Mapped[list["Recording"]] = relationship(back_populates="camera", cascade="all, delete-orphan")


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    camera_id: Mapped[int] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), index=True)
    stream_key: Mapped[str] = mapped_column(String(128), index=True)
    file_path: Mapped[str] = mapped_column(String(2048), unique=True, index=True)
    file_name: Mapped[str] = mapped_column(String(512))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    camera: Mapped[Camera] = relationship(back_populates="recordings")
