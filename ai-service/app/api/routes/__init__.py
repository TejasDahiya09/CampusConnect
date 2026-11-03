from fastapi import APIRouter

from .health import router as health_router
from .lost_found import router as lost_found_router
from .version import router as version_router
from .recommendations import router as recommendations_router
from .ready import router as ready_router
from .assistant import router as assistant_router
from .resume import router as resume_router

operational_router = APIRouter()
operational_router.include_router(health_router)
operational_router.include_router(version_router)
operational_router.include_router(ready_router)
operational_router.include_router(lost_found_router)
operational_router.include_router(recommendations_router)
operational_router.include_router(assistant_router)
operational_router.include_router(resume_router)
