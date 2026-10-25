"""Nearby care: specialty inference, ranking, filtering, the endpoint and its errors."""

from __future__ import annotations

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import config
from app.services import nearby_care_service as svc

HERE = (28.6315, 77.2167)


def item(title, km_north, cats, *, pid=None, phone=None, er=False):
    lat = HERE[0] + km_north / 111.195
    categories = [{"Id": c} for c in cats] + ([{"Id": "hospital_emergency_room"}] if er else [])
    out = {"PlaceId": pid or title, "Title": title, "Position": [HERE[1], lat], "Categories": categories,
           "Address": {"Label": f"{title}, Some Road, Delhi 110001, India"}}
    if phone:
        out["Contacts"] = {"Phones": [{"Value": phone}]}
    return out


class FakePlaces:
    """search_nearby by category, search_text by query."""

    def __init__(self, nearby=None, text=None, fail=False):
        self.nearby, self.text, self.fail = nearby or {}, text or {}, fail
        self.calls = []

    def search_nearby(self, **kw):
        self.calls.append(("nearby", kw))
        if self.fail:
            raise RuntimeError("down")
        return {"ResultItems": [i for c in kw["Filter"]["IncludeCategories"] for i in self.nearby.get(c, [])]}

    def search_text(self, **kw):
        self.calls.append(("text", kw))
        if self.fail:
            raise RuntimeError("down")
        return {"ResultItems": self.text.get(kw["QueryText"], [])}


@pytest.fixture
def places(monkeypatch):
    svc.reset_for_tests()

    def use(fake):
        monkeypatch.setattr(svc, "_client", fake)
        return fake
    yield use
    svc.reset_for_tests()


def sprain_area():
    return FakePlaces(
        nearby={
            "hospital": [item("City Hospital", 0.4, ["hospital"], phone="+911100000000"),
                         item("Far General Hospital", 3.0, ["hospital"], er=True)],
            "medical_services-clinics": [item("Dr. Deep Arya Clinic", 0.03, ["medical_services-clinics"]),
                                         item("Best Ayurvedic Doctor", 0.05, ["medical_services-clinics"]),
                                         item("Healthy Pathology Labs", 0.06, ["medical_services-clinics"])],
        },
        text={"orthopaedic": [item("Bone & Joint Clinic", 3.5, ["medical_services-clinics"])],
              "orthopedic hospital": [item("DFC Orthopedic Hospital", 8.1, ["hospital"])],
              "bone and joint clinic": [item("Bone and Joint Clinic", 3.5, ["medical_services-clinics"], pid="dup")]},
    )


@pytest.mark.parametrize("text,spec", [
    ("I twisted my ankle while running", "orthopaedics"), ("chest pain and breathless", "cardiology"),
    ("my child has a high fever", "paediatrics"), ("toothache since 2 days", "dentistry"),
    ("pet mein dard aur ulti", "gastroenterology"), ("fever for two days", "general"), ("", "general"),
    ("burning while urinating", "urology"), ("feeling anxious and can't sleep", "psychiatry"),
])
def test_infer_specialty(text, spec):
    assert svc.infer_specialty(text) == spec


def test_specialists_first_when_not_urgent_and_non_care_places_dropped(places):
    fake = places(sprain_area())
    out = svc.nearby("u1", lat=HERE[0], lng=HERE[1], specialty="orthopaedics", issue="Ankle sprain", severity="LOW")
    names = [p["name"] for p in out["places"]]
    assert names == ["Bone & Joint Clinic", "DFC Orthopedic Hospital", "Dr. Deep Arya Clinic"]  # duplicate merged; Ayurveda + lab dropped
    assert out["places"][0]["matchesSpecialty"] and out["places"][0]["distanceKm"] == pytest.approx(3.5, abs=0.05)
    assert out["places"][0]["address"] == "Some Road, Delhi 110001, India"
    assert out["specialtyLabel"].startswith("Bones") and out["searchTerm"] == "orthopaedic" and out["issue"] == "Ankle sprain"
    assert len(fake.calls) == 5  # hospitals + clinics nearby, three specialty searches
    text_call = next(kw for k, kw in fake.calls if k == "text")
    assert text_call["Filter"]["Circle"] == {"Center": [HERE[1], HERE[0]], "Radius": config.NEARBY_SPECIALTY_RADIUS_M}


def test_emergency_prefers_near_hospitals_with_an_er(places):
    places(sprain_area())
    out = svc.nearby("u1", lat=HERE[0], lng=HERE[1], specialty="orthopaedics", severity="EMERGENCY")
    assert [p["kind"] for p in out["places"]] == ["hospital", "hospital", "hospital"]
    assert out["places"][0]["name"] == "City Hospital"
    assert any(p["emergency"] for p in out["places"])


def test_general_search_has_no_specialty_queries_and_widens_when_sparse(places):
    fake = places(FakePlaces(nearby={"hospital": [item("Only Hospital", 9.0, ["hospital"])]}))
    out = svc.nearby("u1", lat=HERE[0], lng=HERE[1])
    assert out["specialty"] == "general" and [p["name"] for p in out["places"]] == ["Only Hospital"]
    radii = [kw["QueryRadius"] for k, kw in fake.calls if k == "nearby"]
    assert radii == [config.NEARBY_RADIUS_M] * 2 + [config.NEARBY_SPECIALTY_RADIUS_M] * 2
    assert out["radiusKm"] == config.NEARBY_SPECIALTY_RADIUS_M / 1000


def test_dentists_count_as_specialists(places):
    places(FakePlaces(nearby={"dentist-dental_office": [item("Smilemudra", 0.2, ["dentist-dental_office"])],
                              "hospital": [item("City Hospital", 0.1, ["hospital"])]}))
    top = svc.nearby("u1", lat=HERE[0], lng=HERE[1], specialty="dentistry", severity="LOW")["places"][0]
    assert (top["name"], top["kind"], top["matchesSpecialty"]) == ("Smilemudra", "dentist", True)


def test_focus_from_stored_messages():
    old = [{"id": "u", "role": "user", "content": "my ankle is swollen after I twisted it"},
           {"id": "a", "role": "assistant", "content": json.dumps({"severity": "MODERATE", "advice": "x"})}]
    assert svc.focus_from_messages(old) == {"issue": "Bones & joints (Orthopaedics)", "specialty": "orthopaedics", "severity": "MODERATE"}
    new = old + [{"id": "b", "role": "assistant", "content": json.dumps(
        {"severity": "HIGH", "care": {"issue": "Heart attack risk", "specialty": "cardiology"}})}]
    assert svc.focus_from_messages(new)["specialty"] == "cardiology"
    assert svc.focus_from_messages(new, "a")["specialty"] == "orthopaedics"
    assert svc.focus_from_messages([])["issue"] == ""
    with pytest.raises(svc.NearbyNotFound):
        svc.focus_from_messages(new, "missing")


@pytest.fixture
def api(places, monkeypatch):
    from app.api.routes.care import router
    app = FastAPI()
    app.include_router(router)
    monkeypatch.setattr(config, "AUTH_ENABLED", False)
    return TestClient(app)


def test_endpoint_ok_and_validation(api, places):
    places(sprain_area())
    r = api.post("/api/care/nearby", json={"lat": HERE[0], "lng": HERE[1], "specialty": "orthopaedics", "severity": "LOW"})
    assert r.status_code == 200 and len(r.json()["places"]) == 3 and r.json()["source"] == "Amazon Location Service"
    assert api.post("/api/care/nearby", json={"lat": 91, "lng": 0}).status_code == 422
    assert api.post("/api/care/nearby", json={"lat": 0, "lng": 0, "severity": "BAD"}).status_code == 422


def test_endpoint_reads_the_consultation(api, places, monkeypatch):
    from app.services import consultation_service
    places(sprain_area())
    monkeypatch.setattr(consultation_service, "consultation_exists", lambda u, c: c == "c1")
    monkeypatch.setattr(consultation_service, "list_messages", lambda u, c: [
        {"id": "u", "role": "user", "content": "twisted ankle"},
        {"id": "a", "role": "assistant", "content": json.dumps(
            {"severity": "LOW", "care": {"issue": "Ankle sprain", "specialty": "orthopaedics"}})}])
    r = api.post("/api/care/nearby", json={"lat": HERE[0], "lng": HERE[1], "consultationId": "c1"})
    assert r.status_code == 200 and r.json()["issue"] == "Ankle sprain" and r.json()["severity"] == "LOW"
    assert api.post("/api/care/nearby", json={"lat": 0, "lng": 0, "consultationId": "nope"}).status_code == 404


def test_endpoint_unavailable_and_rate_limited(api, places, monkeypatch):
    places(FakePlaces(fail=True))
    assert api.post("/api/care/nearby", json={"lat": 1, "lng": 1}).status_code == 503
    monkeypatch.setattr(config, "NEARBY_CARE_PER_MINUTE", 1)
    svc.reset_for_tests()
    places(sprain_area())
    assert api.post("/api/care/nearby", json={"lat": 1, "lng": 1}).status_code == 200
    r = api.post("/api/care/nearby", json={"lat": 1, "lng": 1})
    assert r.status_code == 429 and r.headers["retry-after"] == "60"
