import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BudCam"
    database_url: str = "sqlite:///./data/budcam.db"
    secret_key: str = secrets.token_urlsafe(32)
    token_expire_minutes: int = 120
    zlm_api_base: str = "http://127.0.0.1:9911"
    zlm_secret: str = "budcam"
    public_zlm_host: str = "127.0.0.1"
    public_zlm_http_port: int = 9911
    public_zlm_ws_port: int = 9911
    recording_path: str = "/record"
    record_retention_days: int = 0
    cors_origins: str = "*"
    onvif_scan_targets: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="BUDCAM_")

    @property
    def sqlite_path(self) -> Path | None:
        if not self.database_url.startswith("sqlite:///"):
            return None
        return Path(self.database_url.replace("sqlite:///", "", 1))


settings = Settings()
