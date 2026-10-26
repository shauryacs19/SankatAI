"""AI document consent: only unprotected vault files; summaries reach the prompt."""

import json
from types import SimpleNamespace

import pytest

from app.schemas.triage import PatientProfile
from app.services import document_ai_service
from app.services.attachment_service import AttachmentError, AttachmentService


class _Repo:
    def __init__(self): self.items = {}
    def save(self, item): self.items[item["attachment_id"]] = item
    def get(self, u, a): return self.items.get(a)
    def set_ai_access(self, u, a, v): self.items[a]["ai_access"] = v


class _Storage:
    def presigned_put_url(self, *a): return "https://put"
    def presigned_get_url(self, *a, **k): return "https://get"


def _svc():
    cfg = SimpleNamespace(CHAT_BUCKET="c", DOCUMENTS_BUCKET="d", PRESIGN_EXPIRY=60)
    return AttachmentService(_Storage(), _Repo(), cfg)


def test_ai_access_saved_for_vault():
    svc = _svc()
    out = svc.create_upload("u", None, "vault", "document", "r.pdf", "application/pdf", ai_access=True)
    assert svc._repo.items[out["attachmentId"]]["ai_access"] is True


@pytest.mark.parametrize("kw", [dict(scope="vault", password_protected=True, pin_id="p"), dict(scope="chat", chat_id="c1")])
def test_ai_access_rejected_for_protected_or_chat(kw):
    scope = kw.pop("scope")
    with pytest.raises(AttachmentError):
        _svc().create_upload("u", None, scope, "document", "r.pdf", "application/pdf", ai_access=True, **kw)


def test_summary_parse_drops_non_medical():
    assert document_ai_service._parse(json.dumps({"isMedical": False, "summary": "x"})) is None
    assert document_ai_service._parse(json.dumps({"summary": "HbA1c 7.2 %"})) == "HbA1c 7.2 %"


def test_documents_excluded_from_serialisation():
    p = PatientProfile(age=30)
    p.documents = [{"name": "Lab", "summary": "Hb 9"}]
    assert "documents" not in p.model_dump()
