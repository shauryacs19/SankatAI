"""Read an assistant reply aloud (Amazon Polly).

POST /api/tts {consultationId, messageId} -> audio/mpeg (streamed), or, with
TTS_CACHE_ENABLED, a 307 to a short-lived presigned GET of the cached MP3.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse, StreamingResponse

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.tts import TtsRequest
from app.services import tts_service
from app.services.tts_service import TtsNotFound, TtsNotSpeakable, TtsRateLimited, TtsUnavailable

router = APIRouter(prefix="/api", tags=["Text to speech"])

_NO_STORE = {"Cache-Control": "private, no-store"}


@router.post(
    "/tts",
    summary="Read an assistant reply aloud",
    response_class=StreamingResponse,
    responses={200: {"content": {"audio/mpeg": {}}}, 307: {"description": "Cached audio (presigned GET)"}},
)
def read_aloud(body: TtsRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        kind, payload = tts_service.synthesize_message(user.user_id, body.consultationId, body.messageId)
    except TtsNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except TtsNotSpeakable as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except TtsRateLimited as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e), headers={"Retry-After": "60"})
    except TtsUnavailable as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    if kind == "redirect":
        return RedirectResponse(payload, status_code=status.HTTP_307_TEMPORARY_REDIRECT, headers=_NO_STORE)
    return StreamingResponse(payload, media_type="audio/mpeg", headers=_NO_STORE)
