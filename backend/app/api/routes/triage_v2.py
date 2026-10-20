"""Image-first triage endpoints (v2; v1 upload routes are unchanged).

  POST /api/v2/triage/images                 presigned PUT (type + size signed);
                                             creates the consultation if none
  POST /api/v2/triage/images/{id}/complete   validate, strip EXIF, start vision

The photo is then sent with the existing POST /api/consultations/{id}/messages
(``attachmentIds``), with or without text; that turn includes its findings.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.triage_v2 import ImageCompleteResponse, ImagePresignRequest, ImagePresignResponse
from app.services import triage_image_service as svc

router = APIRouter(prefix="/api/v2/triage", tags=["Triage v2"])


@router.post("/images", response_model=ImagePresignResponse, summary="Start a photo upload for triage")
def presign(body: ImagePresignRequest, response: Response, user: CurrentUser = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    try:
        return svc.create_upload(user.user_id, body.contentType, body.size, body.consultationId)
    except svc.ImageError as err:
        raise HTTPException(status_code=err.status, detail=err.detail) from err


@router.post("/images/{image_id}/complete", response_model=ImageCompleteResponse, summary="Validate an uploaded photo")
def complete(image_id: str, response: Response, user: CurrentUser = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    try:
        return svc.complete(user.user_id, image_id)
    except svc.ImageError as err:
        raise HTTPException(status_code=err.status, detail=err.detail) from err
