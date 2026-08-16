"""Stateless triage endpoint (analyze a conversation without persistence)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.triage import AnalyzeRequest, AnalyzeResponse
from app.services.triage_service import run_triage

router = APIRouter(prefix="/api", tags=["Triage"])


@router.post("/analyze", response_model=AnalyzeResponse, summary="Analyze patient symptoms")
def analyze(
    payload: AnalyzeRequest,
    _current_user: CurrentUser = Depends(get_current_user),
) -> AnalyzeResponse:
    """Run AI triage only for authenticated users."""
    messages = payload.messages[-8:]
    text, is_offline = run_triage(messages, payload.patientProfile)
    return AnalyzeResponse(text=text, isOfflineFallback=is_offline)
