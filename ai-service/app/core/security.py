import hmac

from fastapi import Header, HTTPException, Request, status

AI_SERVICE_KEY_HEADER = "X-CampusConnect-AI-Key"


def require_internal_ai_key(
    request: Request,
    supplied_key: str | None = Header(default=None, alias=AI_SERVICE_KEY_HEADER),
) -> None:
    configured = request.app.state.settings.api_key
    if configured is None or supplied_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal service credential",
        )
    if not hmac.compare_digest(supplied_key, configured.get_secret_value()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal service credential",
        )


def require_model_readiness(request: Request) -> None:
    if not request.app.state.model_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI model is not ready",
        )
