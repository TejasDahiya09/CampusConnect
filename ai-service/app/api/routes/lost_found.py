from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.observability import observe_inference
from app.core.security import require_internal_ai_key, require_model_readiness
from app.schemas import MatchRequest, MatchResponse

router = APIRouter(prefix="/api/v1/lost-found", tags=["lost-found-matching"])


@router.post("/match", response_model=MatchResponse, dependencies=[Depends(require_internal_ai_key), Depends(require_model_readiness)])
def match_reports(payload: MatchRequest, request: Request) -> MatchResponse:
    settings = request.app.state.settings
    if len(payload.candidates) > settings.lost_found_max_candidates:
        # The schema-level ceiling is a defense in depth; this binds requests to deployment policy.
        raise HTTPException(status_code=422, detail="candidate count exceeds configured limit")
    if payload.top_k > settings.lost_found_max_top_k:
        raise HTTPException(status_code=422, detail="top_k exceeds configured limit")
    return observe_inference(
        "lost_found_match", request.state.correlation_id, len(payload.candidates), payload.top_k,
        lambda: request.app.state.matching_service.rank(payload.query, payload.candidates, payload.top_k),
    )
