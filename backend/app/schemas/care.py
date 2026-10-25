"""Schemas for the nearby-care search (hospitals / clinics for the chat's problem)."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Severity = Literal["LOW", "MODERATE", "HIGH", "EMERGENCY"]


class NearbyCareRequest(BaseModel):
    # The position is used for this search only: never stored or logged.
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    # The chat it is for: the server reads the assessment's care focus (or
    # infers it from what the person wrote). `specialty` overrides it.
    consultationId: Optional[str] = Field(None, min_length=1, max_length=64)
    messageId: Optional[str] = Field(None, min_length=1, max_length=64)
    specialty: Optional[str] = Field(None, max_length=32)
    issue: Optional[str] = Field(None, max_length=80)
    severity: Optional[Severity] = None
    limit: int = Field(3, ge=1, le=5)


class NearbyPlace(BaseModel):
    id: Optional[str] = None
    name: str
    kind: Literal["hospital", "clinic", "doctor", "dentist"]
    lat: float
    lng: float
    distanceKm: float
    matchesSpecialty: bool
    emergency: Optional[bool] = None
    address: Optional[str] = None
    phone: Optional[str] = None


class NearbyCareResponse(BaseModel):
    issue: str
    specialty: str
    specialtyLabel: str
    searchTerm: str
    severity: Optional[Severity] = None
    places: list[NearbyPlace]
    radiusKm: float
    source: str
