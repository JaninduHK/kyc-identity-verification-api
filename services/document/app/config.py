"""Configuration for the Kestrel Document Service."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    document_port: int = 8001
    onfido_api_token: str = "api_sandbox.replace-me"
    onfido_base_url: str = "https://api.eu.onfido.com/v3.6"
    aws_region: str = "ap-south-1"
    aws_s3_bucket: str = "kestrel-kyc-documents"
    log_level: str = "debug"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )


settings = Settings()
