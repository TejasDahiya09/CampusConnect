from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SemanticCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=3000)


class SemanticRecommendationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)
    query: str = Field(min_length=1, max_length=3000)
    candidates: tuple[SemanticCandidate, ...] = Field(max_length=100)

    @model_validator(mode="after")
    def unique_candidates(self) -> "SemanticRecommendationRequest":
        ids = [candidate.id for candidate in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("candidate IDs must be unique")
        return self


class SemanticScore(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    id: str
    score: float = Field(ge=0, le=1)


class SemanticRecommendationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    model: str
    recommender_version: Literal["teamup-semantic-v1"] = "teamup-semantic-v1"
    results: tuple[SemanticScore, ...]
