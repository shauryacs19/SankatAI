"""Nearby hospitals and clinics for the problem a chat is about.

POST /api/care/nearby {lat, lng, consultationId?, messageId?, specialty?, issue?, severity?, limit?}
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.care import NearbyCareRequest, NearbyCareResponse
from app.services import nearby_care_service as svc

router = APIRouter(prefix="/api", tags=["Nearby care"])


@router.post("/care/nearby", response_model=NearbyCareResponse, summary="Hospitals and clinics near you for this problem")
def nearby_care(body: NearbyCareRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        return svc.nearby(
            user.user_id, lat=body.lat, lng=body.lng, specialty=body.specialty, issue=body.issue,
            severity=body.severity, consultation_id=body.consultationId, message_id=body.messageId, limit=body.limit,
        )
    except svc.NearbyNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except svc.NearbyRateLimited as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e), headers={"Retry-After": "60"})
    except svc.NearbyUnavailable as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
