"""Account-level security PIN management endpoints. All derive the user from the
Cognito token; PINs are stored hashed on the user's record."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.security import CreatePinRequest, DeletePinRequest, SecurityPinView
from app.services import security_pin_service
from app.services.security_pin_service import PinValidationError

router = APIRouter(prefix="/api/security/pins", tags=["Security"])


def _attachments_using_pin(user_id: str, pin_id: str) -> int:
    """Count vault files protected by this PIN. Guarded: if the uploads feature
    (attachments table) isn't configured, there's nothing to block on."""
    try:
        from app.core import config
        from app.repositories.attachment_repository import DynamoAttachmentRepository

        table = getattr(config, "ATTACHMENTS_TABLE", None)
        if not table:
            return 0
        repo = DynamoAttachmentRepository(table, config.AWS_REGION)
        return sum(1 for it in repo.list_by_user(user_id) if it.get("pin_id") == pin_id)
    except Exception:  # noqa: BLE001 - uploads not configured / table missing
        return 0


@router.get("", response_model=list[SecurityPinView], summary="List the user's security PINs")
def list_pins(user: CurrentUser = Depends(get_current_user)):
    return security_pin_service.list_pins(user.user_id)


@router.post("", response_model=SecurityPinView, status_code=status.HTTP_201_CREATED, summary="Create a security PIN")
def create_pin(body: CreatePinRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        return security_pin_service.create_pin(user.user_id, body.label, body.pin)
    except PinValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{pin_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a security PIN")
def delete_pin(pin_id: str, body: DeletePinRequest, user: CurrentUser = Depends(get_current_user)):
    # The PIN itself is the authorisation to remove it — a stolen session alone
    # must not be enough to strip protection off the vault.
    if not security_pin_service.pin_exists(user.user_id, pin_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PIN not found.")
    if not security_pin_service.verify_pin(user.user_id, pin_id, body.pin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Incorrect PIN.")
    in_use = _attachments_using_pin(user.user_id, pin_id)
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This PIN protects {in_use} file(s). Change or remove those files before deleting it.",
        )
    if not security_pin_service.delete_pin(user.user_id, pin_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PIN not found.")
