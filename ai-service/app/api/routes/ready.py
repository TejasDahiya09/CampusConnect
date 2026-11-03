from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from app.matching.embeddings import MODEL_ID, MODEL_REVISION
from app.schemas.operational import ReadinessResponse

router = APIRouter(tags=["operational"])


@router.get("/ready", response_model=ReadinessResponse)
def ready(request: Request) -> ReadinessResponse | JSONResponse:
    settings = request.app.state.settings
    response = ReadinessResponse(
        ready=bool(request.app.state.model_ready and settings.api_key is not None),
        service=settings.service_name, version=settings.service_version,
        embedding_model=MODEL_ID, embedding_revision=MODEL_REVISION,
    )
    if response.ready:
        return response
    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=response.model_dump())
