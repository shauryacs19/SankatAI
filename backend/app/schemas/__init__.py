"""Pydantic schemas, grouped by domain.

Re-exported here so callers can `from app.schemas import X` regardless of which
domain module a model lives in.
"""

from .consultation import (
    ConsultationView,
    CreateConsultationRequest,
    MessageView,
    PostMessageRequest,
    PostMessageResponse,
)
from .profile import EmergencyContact, Profile
from .triage import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    Message,
    PatientProfile,
)

__all__ = [
    "AnalyzeRequest",
    "AnalyzeResponse",
    "ConsultationView",
    "CreateConsultationRequest",
    "EmergencyContact",
    "HealthResponse",
    "Message",
    "MessageView",
    "PatientProfile",
    "PostMessageRequest",
    "PostMessageResponse",
    "Profile",
]
