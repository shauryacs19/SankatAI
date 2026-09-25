"""Pydantic request models for the admin console.

Responses are plain dicts built by the services (their shapes are documented
there); only inputs need validation here.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class CreateInvitationRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


class AcceptInvitationRequest(BaseModel):
    # "<invitation_id>.<secret>" from the emailed link. Never logged.
    token: str = Field(..., min_length=40, max_length=120)
    # The caller's Cognito ID token: the only token that carries `email` and
    # `email_verified`. Verified server-side; must belong to the same `sub`.
    idToken: str = Field(..., min_length=20, max_length=8192)
