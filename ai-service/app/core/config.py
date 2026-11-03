from functools import lru_cache
from pathlib import Path

from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Operational settings for the AI service, sourced only from its environment."""

    service_name: str = Field(default="CampusConnect AI Service", validation_alias="AI_SERVICE_NAME")
    service_version: str = Field(default="0.1.0", validation_alias="AI_SERVICE_VERSION")
    environment: str = Field(default="development", validation_alias="AI_SERVICE_ENV")
    host: str = Field(default="0.0.0.0", validation_alias="AI_SERVICE_HOST")
    port: int = Field(default=8001, ge=1, le=65535, validation_alias="AI_SERVICE_PORT")
    api_key: SecretStr | None = Field(
        default=None, min_length=16, validation_alias="AI_SERVICE_API_KEY"
    )
    inference_concurrency: int = Field(
        default=2, ge=1, le=8, validation_alias="AI_INFERENCE_CONCURRENCY"
    )
    max_request_bytes: int = Field(
        default=1_500_000, ge=100_000, le=16_000_000, validation_alias="AI_MAX_REQUEST_BYTES"
    )
    resume_max_bytes: int = Field(
        default=5_242_880, ge=100_000, le=10_485_760, validation_alias="RESUME_MAX_BYTES"
    )
    resume_max_text_characters: int = Field(
        default=100_000, ge=1_000, le=250_000, validation_alias="RESUME_MAX_TEXT_CHARACTERS"
    )
    resume_processing_timeout_seconds: float = Field(
        default=10.0, ge=1.0, le=30.0, validation_alias="RESUME_PROCESSING_TIMEOUT_SECONDS"
    )
    campus_assistant_enabled: bool = Field(
        default=False, validation_alias="CAMPUS_ASSISTANT_ENABLED"
    )
    google_cloud_project: str | None = Field(
        default=None,
        max_length=128,
        validation_alias="GOOGLE_CLOUD_PROJECT",
    )
    google_cloud_location: str = Field(
        default="global",
        min_length=1,
        max_length=64,
        validation_alias="GOOGLE_CLOUD_LOCATION",
    )
    google_genai_use_vertexai: bool = Field(
        default=True,
        validation_alias="GOOGLE_GENAI_USE_VERTEXAI",
    )
    gemini_model: str = Field(
        default="gemini-2.5-flash",
        min_length=1,
        max_length=120,
        validation_alias="GEMINI_MODEL",
    )
    gemini_generation_timeout_seconds: float = Field(
        default=20.0,
        ge=1.0,
        le=60.0,
        validation_alias="GEMINI_GENERATION_TIMEOUT_SECONDS",
    )
    gemini_max_output_tokens: int = Field(
        default=512,
        ge=64,
        le=2_048,
        validation_alias="GEMINI_MAX_OUTPUT_TOKENS",
    )
    gemini_max_concurrency: int = Field(
        default=1,
        ge=1,
        le=4,
        validation_alias="GEMINI_MAX_CONCURRENCY",
    )
    lost_found_max_candidates: int = Field(
        default=100, ge=1, le=100, validation_alias="AI_LOST_FOUND_MAX_CANDIDATES"
    )
    lost_found_max_top_k: int = Field(
        default=20, ge=1, le=20, validation_alias="AI_LOST_FOUND_MAX_TOP_K"
    )
    lost_found_weight_text: float = Field(
        default=0.55, ge=0, le=1, validation_alias="AI_LOST_FOUND_WEIGHT_TEXT"
    )
    lost_found_weight_category: float = Field(
        default=0.20, ge=0, le=1, validation_alias="AI_LOST_FOUND_WEIGHT_CATEGORY"
    )
    lost_found_weight_location: float = Field(
        default=0.15, ge=0, le=1, validation_alias="AI_LOST_FOUND_WEIGHT_LOCATION"
    )
    lost_found_weight_time: float = Field(
        default=0.10, ge=0, le=1, validation_alias="AI_LOST_FOUND_WEIGHT_TIME"
    )
    lost_found_time_decay_days: float = Field(
        default=14.0, gt=0, le=365, validation_alias="AI_LOST_FOUND_TIME_DECAY_DAYS"
    )
    lost_found_high_confidence_threshold: float = Field(
        default=0.70, ge=0, le=1, validation_alias="AI_LOST_FOUND_HIGH_CONFIDENCE_THRESHOLD"
    )
    lost_found_medium_confidence_threshold: float = Field(
        default=0.40, ge=0, le=1, validation_alias="AI_LOST_FOUND_MEDIUM_CONFIDENCE_THRESHOLD"
    )
    lost_found_min_semantic_similarity: float = Field(
        default=0.50, ge=0, le=1, validation_alias="AI_LOST_FOUND_MIN_SEMANTIC_SIMILARITY"
    )
    lost_found_matcher: Literal["baseline", "semantic", "multimodal"] = Field(
        default="semantic", validation_alias="AI_LOST_FOUND_MATCHER"
    )
    lost_found_embedding_cache_size: int = Field(
        default=512, ge=1, le=10_000, validation_alias="AI_LOST_FOUND_EMBEDDING_CACHE_SIZE"
    )
    lost_found_embedding_device: str = Field(
        default="cpu", min_length=1, validation_alias="AI_LOST_FOUND_EMBEDDING_DEVICE"
    )
    lost_found_image_cache_size: int = Field(
        default=256, ge=1, le=5_000, validation_alias="AI_LOST_FOUND_IMAGE_CACHE_SIZE"
    )
    lost_found_image_device: str = Field(
        default="cpu", min_length=1, validation_alias="AI_LOST_FOUND_IMAGE_DEVICE"
    )

    @field_validator("google_cloud_project", mode="before")
    @classmethod
    def normalizes_optional_project(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return value

    @field_validator("google_cloud_location", "gemini_model")
    @classmethod
    def rejects_blank_generation_configuration(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("generation configuration must not be blank")
        return normalized

    @model_validator(mode="after")
    def validates_lost_found_baseline(self) -> "Settings":
        total_weight = (
            self.lost_found_weight_text
            + self.lost_found_weight_category
            + self.lost_found_weight_location
            + self.lost_found_weight_time
        )
        if abs(total_weight - 1.0) > 1e-9:
            raise ValueError("Lost & Found baseline weights must total 1.0.")
        if self.lost_found_medium_confidence_threshold > self.lost_found_high_confidence_threshold:
            raise ValueError("Lost & Found confidence thresholds must be ordered.")
        return self

    # Uvicorn's --app-dir changes import lookup, not the working directory.
    # Keep the service's local configuration stable for both supported launchers.
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
