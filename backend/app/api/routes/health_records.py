"""Health records: symptom tracker, report analyzer, timeline, doctor report.

All routes are Cognito-authenticated (behind the API Gateway catch-all JWT
route) and scoped to the caller's ``user_id``; another user's ids return 404.

  GET    /api/symptoms                    entries (newest first) + per-symptom series and trend
  POST   /api/symptoms                    {name, severity 1-10, recordedAt?, notes?}
  DELETE /api/symptoms/{id}
  POST   /api/symptoms/summary            {name} -> AI (or computed) trend summary
  GET    /api/reports                     vault documents + analysis state
  GET    /api/reports/{attachmentId}      one analysis
  POST   /api/reports/{attachmentId}/analyze   start (202-style: status "processing"; poll GET)
  GET    /api/timeline?category=a,b       chronological events
  GET    /api/consultations/{id}/doctor-report      one chat's report data (JSON, in-app preview)
  GET    /api/consultations/{id}/doctor-report/pdf  the same as a PDF (no-store)
  POST   /api/doctor-report/selection     {ids} -> PDF of the timeline records picked (no-store)
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.integrations.aws.cognito_auth import CurrentUser, get_current_user
from app.schemas.health_records import SelectionReportRequest, SymptomEntryRequest, SymptomSummaryRequest
from app.services import health_record_service, report_analysis_service as reports, symptom_service

router = APIRouter(prefix="/api", tags=["Health records"])

_NO_STORE = {"Cache-Control": "no-store, private"}


@router.get("/symptoms", summary="Your symptom entries and trends")
def list_symptoms(user: CurrentUser = Depends(get_current_user)):
    return symptom_service.overview(user.user_id)


@router.post("/symptoms", status_code=status.HTTP_201_CREATED, summary="Record a symptom")
def add_symptom(body: SymptomEntryRequest, user: CurrentUser = Depends(get_current_user)):
    return symptom_service.add_entry(user.user_id, body.name, body.severity, body.recordedAt, body.notes)


@router.delete("/symptoms/{symptom_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a symptom entry")
def delete_symptom(symptom_id: str, user: CurrentUser = Depends(get_current_user)):
    try:
        symptom_service.delete_entry(user.user_id, symptom_id)
    except symptom_service.SymptomNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/symptoms/summary", summary="Summarise one symptom's recorded trend")
def summarise_symptom(body: SymptomSummaryRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        return symptom_service.ai_summary(user.user_id, body.name)
    except symptom_service.SymptomNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except symptom_service.SummaryRateLimited as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e), headers={"Retry-After": "60"})


@router.get("/reports", summary="Your documents and their analyses")
def list_reports(user: CurrentUser = Depends(get_current_user)):
    return {"reports": reports.list_reports(user.user_id)}


@router.get("/reports/{attachment_id}", summary="One report analysis")
def get_report(attachment_id: str, response: Response, user: CurrentUser = Depends(get_current_user)):
    response.headers.update(_NO_STORE)
    try:
        return reports.get_report(user.user_id, attachment_id)
    except reports.ReportNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/reports/{attachment_id}/analyze", summary="Analyse a report (runs in the background)")
def analyze_report(attachment_id: str, user: CurrentUser = Depends(get_current_user)):
    try:
        return reports.start(user.user_id, attachment_id)
    except reports.ReportNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except reports.ReportRateLimited as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e), headers={"Retry-After": "60"})
    except reports.ReportError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/timeline", summary="Your health timeline")
def get_timeline(category: Optional[str] = Query(default=None, max_length=100),
                 user: CurrentUser = Depends(get_current_user)):
    cats = {c.strip() for c in category.split(",") if c.strip()} if category else None
    if cats and not cats <= set(health_record_service.CATEGORIES):
        raise HTTPException(status_code=422, detail=f"category must be among {', '.join(health_record_service.CATEGORIES)}")
    return {"events": health_record_service.timeline(user.user_id, cats), "categories": list(health_record_service.CATEGORIES)}


@router.get("/consultations/{consultation_id}/doctor-report", summary="Doctor report data for one chat (preview)")
def doctor_report(consultation_id: str, response: Response, user: CurrentUser = Depends(get_current_user)):
    response.headers.update(_NO_STORE)
    try:
        return health_record_service.chat_report_data(user.user_id, consultation_id)
    except health_record_service.ConsultationNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/consultations/{consultation_id}/doctor-report/pdf", summary="Doctor report for one chat as a PDF")
def doctor_report_pdf(consultation_id: str, user: CurrentUser = Depends(get_current_user)):
    try:
        data = health_record_service.chat_report_data(user.user_id, consultation_id)
    except health_record_service.ConsultationNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return Response(content=health_record_service.render_pdf(data), media_type="application/pdf", headers={
        **_NO_STORE, "Content-Disposition": 'attachment; filename="sankatai-doctor-report.pdf"'})


@router.post("/doctor-report/selection", summary="Doctor report for the timeline records you selected (PDF)")
def selection_report_pdf(body: SelectionReportRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        data = health_record_service.selection_report_data(user.user_id, body.ids)
    except health_record_service.EmptySelection as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return Response(content=health_record_service.render_pdf(data), media_type="application/pdf", headers={
        **_NO_STORE, "Content-Disposition": 'attachment; filename="sankatai-doctor-report.pdf"'})
