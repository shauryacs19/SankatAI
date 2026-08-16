"""Pydantic models for the user profile."""

from __future__ import annotations

from pydantic import BaseModel, Field


class EmergencyContact(BaseModel):
    name: str = ""
    relationship: str = ""
    phone: str = ""


class Insurance(BaseModel):
    provider: str = ""
    policyNumber: str = ""
    policyHolder: str = ""
    helpline: str = ""


class Profile(BaseModel):
    """User profile captured on the profile-setup page."""

    firstName: str = ""
    middleName: str = ""
    lastName: str = ""
    dob: str = ""  # ISO date (YYYY-MM-DD); age is derived from this
    gender: str = ""
    bloodGroup: str = ""
    phone: str = ""
    email: str = ""
    emergencyContacts: list[EmergencyContact] = Field(default_factory=list)
    allergies: str = ""
    conditions: str = ""
    disability: str = ""
    preferredLanguage: str = "English"
    # Insurance details (optional — useful for hospital admission).
    insurance: Insurance = Field(default_factory=Insurance)
    # Risk factors (optional — help the AI assess severity).
    smoker: str = "no"          # "no" | "yes"
    heartHistory: str = "no"    # "no" | "yes"
    # Document-vault category names, including ones that hold no files yet.
    # Categories that DO hold files are derived from the attachment records; this
    # list is what keeps empty categories in sync across web and mobile.
    fileCategories: list[str] = Field(default_factory=list)

    model_config = {"extra": "ignore"}
