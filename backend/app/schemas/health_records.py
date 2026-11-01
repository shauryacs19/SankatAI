"""Request bodies for the health-record features (symptoms, report analysis,
timeline, doctor report). Responses are plain dicts built by the services."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from pydantic import BaseModel, Field, field_validator


class SymptomEntryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    severity: int = Field(ge=1, le=10)
    recordedAt: Optional[datetime] = None  # defaults to now; may be back-dated, never in the future
    notes: str = Field(default="", max_length=500)

    model_config = {"extra": "forbid"}

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Enter a symptom name.")
        return v

    @field_validator("notes")
    @classmethod
    def _notes(cls, v: str) -> str:
        return v.strip()

    @field_validator("recordedAt")
    @classmethod
    def _when(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is None:
            return None
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if v > now + timedelta(minutes=5):
            raise ValueError("The date and time can't be in the future.")
        if v < now - timedelta(days=3650):
            raise ValueError("The date is too far in the past.")
        return v.astimezone(timezone.utc)


class SymptomSummaryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)

    model_config = {"extra": "forbid"}


class SelectionReportRequest(BaseModel):
    # Timeline event ids (c-<chat>, s-<symptom>, a-/u-/m-<document>); only the caller's own count.
    ids: list[Annotated[str, Field(min_length=3, max_length=80, pattern=r"^[cuams]-[A-Za-z0-9_.:-]+$")]] = Field(min_length=1, max_length=300)

    model_config = {"extra": "forbid"}
