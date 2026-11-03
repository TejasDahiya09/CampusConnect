from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.observability import observe_async_inference, observe_inference
from app.core.security import require_internal_ai_key
from app.matching.embeddings import SemanticModelError
from app.schemas import (
    AssistantGenerationRequest,
    AssistantGenerationResponse,
    AssistantRerankRequest,
    AssistantRerankResponse,
)

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant-reranking"])


@router.post(
    "/rerank",
    response_model=AssistantRerankResponse,
    dependencies=[Depends(require_internal_ai_key)],
)
def rerank_evidence(payload: AssistantRerankRequest, request: Request) -> AssistantRerankResponse:
    if payload.evidence and not request.app.state.model_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI model is not ready",
        )
    try:
        return observe_inference(
            "assistant_semantic_rerank",
            request.state.correlation_id,
            len(payload.evidence),
            payload.limit,
            lambda: request.app.state.assistant_reranker.rank(payload),
        )
    except SemanticModelError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="semantic reranking unavailable",
        ) from error


@router.post(
    "/generate",
    response_model=AssistantGenerationResponse,
    dependencies=[Depends(require_internal_ai_key)],
)
async def generate_answer(
    payload: AssistantGenerationRequest,
    request: Request,
) -> AssistantGenerationResponse:
    return await observe_async_inference(
        "assistant_grounded_generation",
        request.state.correlation_id,
        len(payload.evidence),
        1,
        lambda: request.app.state.assistant_generation_service.generate(payload),
    )
