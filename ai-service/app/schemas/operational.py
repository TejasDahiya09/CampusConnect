from typing import Literal

from pydantic import BaseModel, ConfigDict


class OperationalResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    service: str
    version: str


class HealthResponse(OperationalResponse):
    status: Literal["ok"] = "ok"


class VersionResponse(OperationalResponse):
    api_version: Literal["v1"] = "v1"
    capabilities: tuple[str, ...] = (
        "lost-found-baseline-matching",
        "lost-found-semantic-matching",
        "marketplace-hybrid-recommendations",
        "assistant-semantic-reranking",
        "assistant-grounded-generation",
        "resume-skill-extraction",
        "teamup-semantic-recommendations",
    )
    semantic_matcher: Literal["lf-semantic-v1"] = "lf-semantic-v1"
    baseline_matcher: Literal["lf-baseline-v1"] = "lf-baseline-v1"
    recommender: Literal["marketplace-hybrid-v1"] = "marketplace-hybrid-v1"
    embedding_model: str
    embedding_revision: str
    multimodal_status: Literal["disabled"] = "disabled"


class ReadinessResponse(OperationalResponse):
    ready: bool
    semantic_matcher: Literal["lf-semantic-v1"] = "lf-semantic-v1"
    recommender: Literal["marketplace-hybrid-v1"] = "marketplace-hybrid-v1"
    embedding_model: str
    embedding_revision: str
