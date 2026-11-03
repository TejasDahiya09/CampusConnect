import asyncio

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app.core.security import require_internal_ai_key
from app.resume.parser import ResumeParseError, parse_resume
from app.resume.schemas import ResumeAnalysisResponse
from app.resume.skills import extract_skills

router = APIRouter(prefix="/api/v1/resume", tags=["resume-analysis"])


@router.post("/analyze", response_model=ResumeAnalysisResponse, dependencies=[Depends(require_internal_ai_key)])
async def analyze_resume(
    request: Request,
    content_type: str = Header(alias="Content-Type"),
) -> ResumeAnalysisResponse:
    settings = request.app.state.settings
    media_type = content_type.split(";", 1)[0].strip().lower()
    content = await request.body()
    if not content or len(content) > settings.resume_max_bytes:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="resume exceeds the configured size limit")
    try:
        text = await asyncio.wait_for(
            asyncio.to_thread(parse_resume, content, media_type, settings.resume_max_text_characters),
            timeout=settings.resume_processing_timeout_seconds,
        )
        return ResumeAnalysisResponse(skills=extract_skills(text))
    except TimeoutError as error:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="resume processing timed out") from error
    except ResumeParseError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail={"code": error.code, "message": str(error)}) from error
