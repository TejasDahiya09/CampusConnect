from fastapi import APIRouter, Request

from app.core.config import Settings
from app.schemas import HealthResponse

router = APIRouter(tags=["operational"])


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    return HealthResponse(service=settings.service_name, version=settings.service_version)
