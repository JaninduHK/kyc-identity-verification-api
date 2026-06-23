"""Configuration for the Kestrel Biometric Service.

All settings are loaded from environment variables via pydantic-settings.
Never hardcode tokens, keys, or URLs anywhere else in the codebase — read
everything from the cached :func:`get_settings` accessor.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Onfido (primary provider). The token has no real default so it is never
    # hardcoded; an empty string lets the app boot for health checks while any
    # live Onfido call will simply fail and be reported via result.error.
    ONFIDO_API_TOKEN: str = ""
    ONFIDO_BASE_URL: str = "https://api.eu.onfido.com/v3.6"

    # AWS Rekognition (fallback provider).
    AWS_REGION: str = "ap-south-1"
    REKOGNITION_ENABLED: bool = False

    # Service.
    BIOMETRIC_PORT: int = 8002
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    """Return a process-cached :class:`Settings` instance."""
    return Settings()
