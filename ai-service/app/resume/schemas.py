from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ResumeSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=80)
    evidence: str = Field(min_length=1, max_length=240)
    method: Literal["explicit_mention", "alias_normalization", "context_inference"]
    confidence: Literal["high", "medium"]


class ResumeAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["completed"] = "completed"
    skills: tuple[ResumeSkill, ...] = Field(max_length=100)
