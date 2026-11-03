import logging
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

logger = logging.getLogger("campusconnect.ai.inference")
logger.setLevel(logging.INFO)
T = TypeVar("T")


def observe_inference(operation: str, correlation_id: str, candidate_count: int, result_limit: int, callback: Callable[[], T]) -> T:
    started = time.perf_counter()
    try:
        result = callback()
    except Exception as error:
        logger.warning(
            "ai_inference operation=%s correlation_id=%s outcome=failure error_category=%s candidates=%d limit=%d duration_ms=%.3f",
            operation, correlation_id, type(error).__name__, candidate_count, result_limit,
            (time.perf_counter() - started) * 1000,
        )
        raise
    version = (
        getattr(result, "matcher_version", None)
        or getattr(result, "recommender_version", None)
        or getattr(result, "reranker_version", "unknown")
    )
    logger.info(
        "ai_inference operation=%s correlation_id=%s outcome=success engine=%s candidates=%d limit=%d duration_ms=%.3f",
        operation, correlation_id, version, candidate_count, result_limit,
        (time.perf_counter() - started) * 1000,
    )
    return result


async def observe_async_inference(
    operation: str,
    correlation_id: str,
    candidate_count: int,
    result_limit: int,
    callback: Callable[[], Awaitable[T]],
) -> T:
    started = time.perf_counter()
    try:
        result = await callback()
    except Exception as error:
        logger.warning(
            "ai_inference operation=%s correlation_id=%s outcome=failure error_category=%s candidates=%d limit=%d duration_ms=%.3f",
            operation,
            correlation_id,
            type(error).__name__,
            candidate_count,
            result_limit,
            (time.perf_counter() - started) * 1000,
        )
        raise
    logger.info(
        "ai_inference operation=%s correlation_id=%s outcome=success engine=grounded-generation candidates=%d limit=%d duration_ms=%.3f",
        operation,
        correlation_id,
        candidate_count,
        result_limit,
        (time.perf_counter() - started) * 1000,
    )
    return result
