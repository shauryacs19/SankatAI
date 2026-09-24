"""Voice input. The client streams audio DIRECTLY to Amazon Transcribe over a
WebSocket; this endpoint only issues the short-lived presigned URL for it.

Flow:
  1. POST /api/voice/session -> { url, expiresIn, languageOptions, ... }
  2. client opens `url` (wss, 60s to connect) and sends PCM as AWS event-stream
  3. Transcribe identifies the language and returns partial/final transcripts
  4. the user reviews the text and sends it (with the detected `lang`) through
     the normal chat messages endpoint
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.voice import VoiceSessionResponse
from app.services import voice_service
from app.services.voice_service import VoiceRateLimitError, VoiceUnavailableError

router = APIRouter(prefix="/api/voice", tags=["Voice"])


@router.post("/session", response_model=VoiceSessionResponse, summary="Get a presigned Transcribe streaming URL")
def create_session(response: Response, user: CurrentUser = Depends(get_current_user)):
    # The URL carries signing credentials: never let any cache keep it.
    # A body (e.g. the old {languageCode}) is accepted and ignored.
    response.headers["Cache-Control"] = "no-store"
    try:
        return voice_service.create_session(user.user_id)
    except VoiceRateLimitError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e), headers={"Retry-After": "60"})
    except VoiceUnavailableError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
