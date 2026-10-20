"""Image-first triage: presign (type + size signed), validation, EXIF strip, vision -> triage."""

from __future__ import annotations

import io
import json
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.core import config
from app.services import consultation_service, triage_service, vision_service

USER = "user-img-1"


@pytest.fixture
def env(aws, monkeypatch):
    import boto3

    from app.api.routes.triage_v2 import router

    boto3.client("s3", region_name="ap-south-1").create_bucket(
        Bucket=config.CHAT_BUCKET, CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: False)  # no background vision unless a test wants it
    app = FastAPI()
    app.include_router(router)
    return TestClient(app), boto3.client("s3", region_name="ap-south-1")


def jpeg_with_gps() -> bytes:
    img = Image.new("RGB", (64, 48), (200, 80, 80))
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"  # Make
    exif[0x8825] = {1: "N", 2: (28.0, 36.0, 50.0), 3: "E", 4: (77.0, 12.0, 30.0)}  # GPS IFD
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif)
    assert Image.open(io.BytesIO(out.getvalue())).getexif()  # the fixture really has EXIF
    return out.getvalue()


def presign(client, **body):
    return client.post("/api/v2/triage/images", json={"contentType": "image/jpeg", "size": 1000, **body},
                       headers={"x-user-id": USER})


def upload(client, s3, data: bytes, content_type="image/jpeg"):
    r = presign(client, size=len(data), contentType=content_type)
    assert r.status_code == 200, r.text
    body = r.json()
    key = vision_service._repo().get(USER, body["imageId"])["key"]
    assert urlparse(body["uploadUrl"]).path.endswith(key)
    s3.put_object(Bucket=config.CHAT_BUCKET, Key=key, Body=data, ContentType=content_type)  # the browser's PUT
    return body, key


def test_presign_starts_a_consultation_and_signs_type_and_size(env):
    client, _ = env
    r = presign(client)
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    body = r.json()
    assert consultation_service.consultation_exists(USER, body["consultationId"])
    signed = parse_qs(urlparse(body["uploadUrl"]).query)["X-Amz-SignedHeaders"][0].split(";")
    assert {"content-length", "content-type"} <= set(signed)


def test_presign_rejects_bad_type_size_and_other_peoples_chats(env):
    client, _ = env
    assert presign(client, contentType="image/gif").status_code == 422
    assert presign(client, contentType="application/pdf").status_code == 422
    assert presign(client, size=config.TRIAGE_IMAGE_MAX_BYTES + 1).status_code == 413
    assert presign(client, consultationId="not-mine").status_code == 404


def test_complete_strips_exif_and_marks_uploaded(env):
    client, s3 = env
    body, key = upload(client, s3, jpeg_with_gps())
    r = client.post(f"/api/v2/triage/images/{body['imageId']}/complete", headers={"x-user-id": USER})
    assert r.status_code == 200, r.text
    assert r.json()["contentType"] == "image/jpeg" and r.json()["previewUrl"]
    stored = s3.get_object(Bucket=config.CHAT_BUCKET, Key=key)["Body"].read()
    assert not Image.open(io.BytesIO(stored)).getexif()  # no GPS, no device
    item = vision_service._repo().get(USER, body["imageId"])
    assert item["status"] == "uploaded" and item["sanitized"] is True


@pytest.mark.parametrize("data,ctype", [(b"%PDF-1.4 not a photo", "image/jpeg"), (None, "image/png")])
def test_complete_rejects_and_deletes_bad_files(env, data, ctype):
    client, s3 = env
    data = data or jpeg_with_gps()  # JPEG bytes declared as PNG
    body, key = upload(client, s3, data, ctype)
    r = client.post(f"/api/v2/triage/images/{body['imageId']}/complete", headers={"x-user-id": USER})
    assert r.status_code == 415
    assert s3.list_objects_v2(Bucket=config.CHAT_BUCKET, Prefix=key).get("KeyCount", 0) == 0
    assert vision_service._repo().get(USER, body["imageId"])["status"] == "rejected"


def test_complete_is_scoped_to_the_owner(env):
    client, s3 = env
    body, _ = upload(client, s3, jpeg_with_gps())
    assert client.post(f"/api/v2/triage/images/{body['imageId']}/complete", headers={"x-user-id": "someone-else"}).status_code == 404


class FakeAI:
    def __init__(self):
        self.images = 0

    def analyze_image(self, b64, mime, *, timeout=None):
        self.images += 1
        return json.dumps({"isMedical": True, "bodyRegion": "left forearm", "visibleSigns": ["deep cut", "active bleeding"],
                           "redFlags": ["heavy bleeding"], "severityCue": "severe", "summary": "A deep cut on a forearm."})

    def generate(self, messages, *, seed=None, timeout=None):
        return json.dumps({"reasoning": "r", "advice": "Press firmly on the wound.", "warningSigns": [], "seekCare": "now"})


def test_photo_only_message_gets_a_triage_turn_from_its_findings(env, monkeypatch):
    client, s3 = env
    ai = FakeAI()
    monkeypatch.setattr(triage_service, "ai_key_configured", lambda: True)
    monkeypatch.setattr(triage_service, "get_provider", lambda: ai)
    monkeypatch.setattr(vision_service, "get_provider", lambda: ai)
    monkeypatch.setattr(consultation_service.language_service, "resolve_language", lambda *a: "en-IN")
    body, _ = upload(client, s3, jpeg_with_gps())
    assert client.post(f"/api/v2/triage/images/{body['imageId']}/complete", headers={"x-user-id": USER}).status_code == 200

    result = consultation_service.post_message(USER, body["consultationId"], "", [body["imageId"]])
    reply = json.loads(result["assistantMessage"]["content"])
    assert reply["triage"]["features"]["image"] == {"cue": "severe", "region": "left forearm"}
    assert reply["severity"] == "EMERGENCY" and "108" in reply["advice"]  # the photo's red flag
    assert ai.images == 1  # analysed once (prefetch or on demand), then cached on the row
    assert json.loads(vision_service._repo().get(USER, body["imageId"])["vision_findings"])["severityCue"] == "severe"

    # The next turn reuses the cached findings.
    consultation_service.post_message(USER, body["consultationId"], "it is still bleeding a bit")
    assert ai.images == 1
