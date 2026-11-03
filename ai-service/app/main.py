import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.api.routes import operational_router
from app.core.config import Settings, get_settings
from app.generation.gemini import create_generation_provider
from app.generation.assistant_service import AssistantGenerationService
from app.matching.service import LostFoundMatchingService
from app.matching.embeddings import (
    CachedEmbeddingProvider,
    EmbeddingCache,
    EmbeddingProvider,
    SemanticModelError,
    SentenceTransformerEmbeddingProvider,
)
from app.matching.recommendations import MarketplaceRecommender
from app.matching.assistant_reranker import AssistantSemanticReranker
from app.recommendations.scoring import TeamUpSemanticScorer

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def create_app(
    settings: Settings | None = None,
    embedding_provider: EmbeddingProvider | None = None,
) -> FastAPI:
    """Create an operational FastAPI app without coupling it to CampusConnect data stores."""

    resolved_settings = settings or get_settings()
    base_provider = embedding_provider or SentenceTransformerEmbeddingProvider(
        resolved_settings.lost_found_embedding_device,
        resolved_settings.inference_concurrency,
    )
    shared_provider = CachedEmbeddingProvider(
        base_provider, EmbeddingCache(resolved_settings.lost_found_embedding_cache_size)
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "AI service started: name=%s version=%s environment=%s",
            resolved_settings.service_name,
            resolved_settings.service_version,
            resolved_settings.environment,
        )
        application.state.model_ready = False
        try:
            if isinstance(base_provider, SentenceTransformerEmbeddingProvider):
                await asyncio.to_thread(base_provider.preload)
            else:
                await asyncio.to_thread(base_provider.encode, ("campusconnect model readiness",))
            application.state.model_ready = True
            logger.info(
                "ai_model_preload outcome=success model=%s revision=%s",
                base_provider.model_id,
                getattr(base_provider, "revision", "configured"),
            )
        except SemanticModelError:
            logger.error("ai_model_preload outcome=failure error_category=SemanticModelError")
        except Exception as error:
            logger.error("ai_model_preload outcome=failure error_category=%s", type(error).__name__)
        yield
        await application.state.generation_provider.aclose()

    app = FastAPI(
        title=resolved_settings.service_name,
        version=resolved_settings.service_version,
        debug=False,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.model_ready = False
    app.state.embedding_provider = shared_provider
    app.state.base_embedding_provider = base_provider
    app.state.matching_service = LostFoundMatchingService(
        resolved_settings, shared_text_provider=shared_provider
    )
    app.state.marketplace_recommender = MarketplaceRecommender(
        shared_provider,
        resolved_settings.lost_found_embedding_cache_size,
    )
    app.state.assistant_reranker = AssistantSemanticReranker(shared_provider)
    app.state.teamup_semantic_scorer = TeamUpSemanticScorer(shared_provider)
    app.state.generation_provider = create_generation_provider(resolved_settings)
    app.state.assistant_generation_service = AssistantGenerationService(
        app.state.generation_provider
    )

    @app.middleware("http")
    async def operational_boundaries(request: Request, call_next):
        supplied_request_id = request.headers.get("X-Request-ID")
        try:
            request_id = str(UUID(supplied_request_id)) if supplied_request_id else str(uuid4())
        except ValueError:
            request_id = str(uuid4())
        request.state.correlation_id = request_id
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                request_limit = (
                    resolved_settings.resume_max_bytes
                    if request.url.path == "/api/v1/resume/analyze"
                    else resolved_settings.max_request_bytes
                )
                too_large = int(content_length) > request_limit
            except ValueError:
                too_large = True
            if too_large:
                return JSONResponse(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    content={"detail": "request body exceeds the configured limit"},
                    headers={"X-Request-ID": request_id},
                )
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    app.include_router(operational_router)

    return app


app = create_app()
