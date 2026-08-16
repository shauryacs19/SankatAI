"""Profile endpoints."""

from __future__ import annotations

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends
from fastapi import HTTPException, status

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.profile import Profile
from app.services import profile_service

router = APIRouter(prefix="/api", tags=["Profile"])


@router.get("/profile", response_model=Profile | None, summary="Get the user's profile")
def get_profile(user: CurrentUser = Depends(get_current_user)):
    try:
        stored = profile_service.get_profile(user.user_id)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile storage is unavailable. Start DynamoDB Local or configure the AWS DynamoDB table.",
        ) from exc
    if not stored:
        return None
    return Profile(**stored)


@router.put("/profile", response_model=Profile, summary="Create or update the profile")
def put_profile(profile: Profile, user: CurrentUser = Depends(get_current_user)):
    try:
        saved = profile_service.save_profile(user.user_id, user.email, profile.model_dump())
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile storage is unavailable. Start DynamoDB Local or configure the AWS DynamoDB table.",
        ) from exc
    return Profile(**saved)
