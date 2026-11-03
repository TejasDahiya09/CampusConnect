from fastapi import APIRouter, Depends, Request

from app.core.observability import observe_inference
from app.core.security import require_internal_ai_key, require_model_readiness
from app.schemas.recommendations import MarketplaceRecommendationRequest, MarketplaceRecommendationResponse
from app.recommendations.schemas import SemanticRecommendationRequest, SemanticRecommendationResponse

router = APIRouter(prefix="/api/v1/recommendations", tags=["recommendations"])


@router.post("/marketplace", response_model=MarketplaceRecommendationResponse, dependencies=[Depends(require_internal_ai_key), Depends(require_model_readiness)])
def marketplace_recommendations(payload: MarketplaceRecommendationRequest, request: Request) -> MarketplaceRecommendationResponse:
    return observe_inference(
        "marketplace_recommendations", request.state.correlation_id, len(payload.candidates), payload.limit,
        lambda: request.app.state.marketplace_recommender.rank(payload),
    )


@router.post("/teamup/semantic", response_model=SemanticRecommendationResponse, dependencies=[Depends(require_internal_ai_key), Depends(require_model_readiness)])
def teamup_semantic(payload: SemanticRecommendationRequest, request: Request) -> SemanticRecommendationResponse:
    return observe_inference(
        "teamup_semantic_recommendations", request.state.correlation_id, len(payload.candidates), len(payload.candidates),
        lambda: request.app.state.teamup_semantic_scorer.score(payload),
    )
