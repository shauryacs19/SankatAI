"""Guest chat (no account) and saving a guest conversation after sign-up.

POST /api/guest/chat is public: API Gateway gives it a route with no
authorizer (and a route throttle); everything else under /api/guest stays
behind the Cognito catch-all. It never reads x-user-id and stores nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.consultation import ConsultationView
from app.schemas.guest import GuestChatRequest, GuestChatResponse, GuestReply, GuestSaveRequest
from app.services import guest_service
from app.services.guest_service import GuestError

router = APIRouter(prefix="/api/guest", tags=["Guest"])


def _raise(e: GuestError):
    headers = {"Retry-After": "60"} if e.status == 429 else None
    raise HTTPException(status_code=e.status, detail=e.detail, headers=headers)


@router.post("/chat", response_model=GuestChatResponse, summary="Guest AI triage turn (no account, nothing stored)")
def guest_chat(
    body: GuestChatRequest,
    request: Request,
    # API Gateway OVERWRITES x-client-ip with the caller's source IP, so it is
    # trusted for rate limiting; locally the socket address is used.
    x_client_ip: str | None = Header(default=None, alias="x-client-ip"),
):
    client_key = x_client_ip or (request.client.host if request.client else "unknown")
    try:
        reply = guest_service.chat(body.guestId, body.messages, client_key)
    except GuestError as e:
        _raise(e)
    return GuestChatResponse(reply=GuestReply(**reply))


@router.post("/save", response_model=ConsultationView, summary="Save a verified guest conversation to your account")
def save_guest_chat(body: GuestSaveRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        return guest_service.save(user.user_id, body.guestId, body.messages)
    except GuestError as e:
        _raise(e)
