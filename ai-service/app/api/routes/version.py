from fastapi import APIRouter, Request

from app.core.config import Settings
from app.schemas import VersionResponse
from app.matching.embeddings import MODEL_ID, MODEL_REVISION

router = APIRouter(tags=["operational"])


@router.get("/version", response_model=VersionResponse)
def version(request: Request) -> VersionResponse:
    settings: Settings = request.app.state.settings
    return VersionResponse(
        service=settings.service_name, version=settings.service_version,
        embedding_model=MODEL_ID, embedding_revision=MODEL_REVISION,
    )
