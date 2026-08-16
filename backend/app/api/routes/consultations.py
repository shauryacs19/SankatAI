"""Consultation (chat history) endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.consultation import (
    ConsultationView,
    CreateConsultationRequest,
    FeedbackRequest,
    MessageView,
    PostMessageRequest,
    PostMessageResponse,
    RenameConsultationRequest,
)
from app.services import consultation_service

router = APIRouter(prefix="/api", tags=["Consultations"])


@router.get("/consultations", response_model=list[ConsultationView], summary="List consultations")
def list_consultations(
    q: str | None = Query(default=None, max_length=120, description="Filter by title or message text"),
    user: CurrentUser = Depends(get_current_user),
):
    if q and q.strip():
        return consultation_service.search_consultations(user.user_id, q)
    return consultation_service.list_consultations(user.user_id)


@router.post("/consultations", response_model=ConsultationView, summary="Start a new consultation")
def create_consultation(
    body: CreateConsultationRequest | None = None,
    user: CurrentUser = Depends(get_current_user),
):
    title = body.title if body and body.title else None
    return consultation_service.create_consultation(user.user_id, title)


@router.patch(
    "/consultations/{consultation_id}",
    response_model=ConsultationView,
    summary="Rename a consultation",
)
def rename_consultation(
    consultation_id: str,
    body: RenameConsultationRequest,
    user: CurrentUser = Depends(get_current_user),
):
    updated = consultation_service.rename_consultation(user.user_id, consultation_id, body.title)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")
    return updated


@router.get(
    "/consultations/{consultation_id}/messages",
    response_model=list[MessageView],
    summary="Get a consultation's messages",
)
def get_messages(consultation_id: str, user: CurrentUser = Depends(get_current_user)):
    if not consultation_service.consultation_exists(user.user_id, consultation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")
    return consultation_service.list_messages(user.user_id, consultation_id)


@router.delete(
    "/consultations/{consultation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a consultation",
)
def delete_consultation(consultation_id: str, user: CurrentUser = Depends(get_current_user)):
    if not consultation_service.delete_consultation(user.user_id, consultation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")


@router.post(
    "/consultations/{consultation_id}/messages",
    response_model=PostMessageResponse,
    summary="Send a message and get AI triage",
)
def post_message(
    consultation_id: str,
    body: PostMessageRequest,
    user: CurrentUser = Depends(get_current_user),
):
    if not consultation_service.consultation_exists(user.user_id, consultation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consultation not found.")

    result = consultation_service.post_message(
        user.user_id, consultation_id, body.content, body.attachmentIds
    )
    if result is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is empty.")
    assistant = result["assistantMessage"]
    return PostMessageResponse(
        userMessage=MessageView(**result["userMessage"]),
        assistantMessage=MessageView(**assistant) if assistant else None,
        isOfflineFallback=result["isOfflineFallback"],
    )


@router.delete(
    "/consultations/{consultation_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsend (soft-delete) one of your own messages",
)
def delete_message(
    consultation_id: str,
    message_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    """Flags the message ``deleted`` so it stops being returned; the row itself
    is kept. Only the caller's OWN (role=user) messages can be unsent."""
    outcome = consultation_service.soft_delete_message(user.user_id, consultation_id, message_id)
    if outcome == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    if outcome == "not_own":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only your own messages can be unsent.",
        )


@router.post(
    "/consultations/{consultation_id}/messages/{message_id}/feedback",
    response_model=MessageView,
    summary="Like/dislike an AI response",
)
def set_message_feedback(
    consultation_id: str,
    message_id: str,
    body: FeedbackRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Record (or clear) like/dislike on an AI-generated message. The user is
    taken from the verified token — never the client — and the message must live
    in the caller's own conversation and be an assistant response."""
    outcome, view = consultation_service.set_message_feedback(
        user.user_id, consultation_id, message_id, body.feedback
    )
    if outcome == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    if outcome == "not_ai":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Feedback can only be given on AI responses.",
        )
    return view
