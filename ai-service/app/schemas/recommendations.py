from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MAX_INTEREST_LENGTH = 100
MAX_CONTEXT_CHARACTERS = 3_000


class CategorySignal(BaseModel):
    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")
    category: str = Field(min_length=1, max_length=100)
    strength: float = Field(ge=0, le=1)
    source: Literal["bookmark", "view"]


class RecommendationContext(BaseModel):
    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")
    interests: tuple[str, ...] = Field(default=(), max_length=30)
    category_signals: tuple[CategorySignal, ...] = Field(default=(), max_length=50)

    @field_validator("interests")
    @classmethod
    def validates_interests(cls, interests: tuple[str, ...]) -> tuple[str, ...]:
        normalized = tuple(" ".join(value.split()) for value in interests)
        if any(not value or len(value) > MAX_INTEREST_LENGTH for value in normalized):
            raise ValueError("interests must be non-empty and bounded")
        if sum(len(value) for value in normalized) > MAX_CONTEXT_CHARACTERS:
            raise ValueError("interest context is too large")
        return normalized


class RecommendationCandidate(BaseModel):
    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(max_length=180)
    description: str = Field(max_length=5000)
    category: str = Field(min_length=1, max_length=100)
    created_at: datetime


class MarketplaceRecommendationRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    user_context: RecommendationContext
    candidates: tuple[RecommendationCandidate, ...] = Field(max_length=100)
    limit: int = Field(default=8, ge=1, le=20)

    @model_validator(mode="after")
    def validates_unique_candidate_ids(self) -> "MarketplaceRecommendationRequest":
        candidate_ids = [candidate.id for candidate in self.candidates]
        if len(candidate_ids) != len(set(candidate_ids)):
            raise ValueError("candidate IDs must be unique")
        return self


class RecommendationResult(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    listing_id: str
    score: float = Field(ge=0, le=1)
    reasons: tuple[str, ...]


class MarketplaceRecommendationResponse(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    recommender_version: Literal["marketplace-hybrid-v1"]
    strategy: Literal["hybrid", "profile", "recent"]
    results: tuple[RecommendationResult, ...]

    @model_validator(mode="after")
    def validates_unique_results(self) -> "MarketplaceRecommendationResponse":
        result_ids = [result.listing_id for result in self.results]
        if len(result_ids) != len(set(result_ids)):
            raise ValueError("recommendation result IDs must be unique")
        return self
