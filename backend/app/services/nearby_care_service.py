"""Nearby hospitals and clinics for the problem a chat is about.

The care focus (``issue`` + ``specialty``) comes from the assessment: the LLM
names it (``care`` in the reply JSON), else keywords in what the person wrote
(``infer_specialty``). Places come from Amazon Location Service (Places v2,
IAM only, no resource): hospitals and clinics around the person plus a few
specialty searches ("cardiologist", "heart hospital"...), all in parallel
(~0.3 s). They are ranked so places that treat this specialty come first, then
by distance; for HIGH/EMERGENCY, hospitals (emergency rooms first) lead. The
data has no ratings, so "best" = specialty match, facility type and distance.

Service terms (AWS §82.4): place results are never stored or cached here, and
the client shows the attribution. The position is never stored or logged.
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Optional

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter

logger = logging.getLogger("sankatai")


class NearbyUnavailable(Exception):
    """The places search failed or timed out."""


class NearbyRateLimited(Exception):
    pass


class NearbyNotFound(Exception):
    pass


@dataclass(frozen=True)
class Specialty:
    label: str
    names: str  # facility-name words that mean this specialty (regex, matched at a word start)
    text: str  # what the person wrote that points here (regex)
    queries: tuple[str, ...]  # place text searches; the first is also the Google Maps search


# Order matters for ties (e.g. "chest pain and breathless" -> cardiology first).
SPECIALTIES: dict[str, Specialty] = {
    "cardiology": Specialty(
        "Heart care (Cardiology)", r"heart|cardi",
        r"chest (pain|tight|heav|pressure)|heart|palpitat|cardiac|blood pressure|\bbp\b|seene? (me|mein) dard",
        ("cardiologist", "heart hospital", "heart clinic")),
    "neurology": Specialty(
        "Brain & nerves (Neurology)", r"neuro|brain|stroke",
        r"stroke|seizure|\bfits?\b|paraly|numb|slurr|migraine|headache|dizz|vertigo|faint|unconscious|sar ?dard",
        ("neurologist", "neuro hospital", "neurology clinic")),
    "pulmonology": Specialty(
        "Lungs & breathing (Pulmonology)", r"chest|lung|pulmo|respirat|\btb\b|asthma",
        r"breath|asthma|wheez|lung|cough|phlegm|saans",
        ("pulmonologist", "chest clinic", "chest hospital")),
    "orthopaedics": Specialty(
        "Bones & joints (Orthopaedics)", r"ortho|bone|joint|fracture|trauma|physio|sports injur",
        r"fractur|sprain|ankle|knee|wrist|shoulder|back pain|neck pain|\bbones?\b|joint|twist|broke|dislocat|injur|\bfell\b",
        ("orthopaedic", "orthopedic hospital", "bone and joint clinic")),
    "gastroenterology": Specialty(
        "Stomach & digestion (Gastroenterology)", r"gastro|digest|liver|stomach|gut\b",
        r"stomach|abdom|belly|vomit|diarrh|loose motion|acidity|\bgas\b|indigestion|liver|jaundice|constipat|pet ?(me|mein)? ?dard|\bulti(yan)?\b",
        ("gastroenterologist", "gastro clinic", "liver clinic")),
    "urology": Specialty(
        "Kidney & urinary (Urology)", r"kidney|uro|nephro",
        r"urin|\bpee\b|kidney|bladder|stone",
        ("urologist", "kidney hospital", "urology clinic")),
    "gynaecology": Specialty(
        "Women's health (Gynaecology)", r"gyn|matern|women|obstet|mother|ivf|fertility",
        r"pregnan|period|menstru|vagin|miscarr|labou?r pain|white discharge",
        ("gynaecologist", "maternity hospital", "women's clinic")),
    "paediatrics": Specialty(
        "Children (Paediatrics)", r"child|kids|paed|pediat|shishu|neonat",
        r"\bbaby\b|infant|newborn|toddler|my (son|daughter|child|kid)|\bchild\b|bachch?[ae]",
        ("paediatrician", "child clinic", "children's hospital")),
    "dermatology": Specialty(
        "Skin (Dermatology)", r"skin|derma",
        r"rash|skin|itch|acne|pimple|eczema|hives|blister|fungal|khujli",
        ("dermatologist", "skin clinic")),
    "ophthalmology": Specialty(
        "Eyes (Ophthalmology)", r"eye|netra|ophthal|drishti|retina",
        r"\beyes?\b|vision|blurr|aankh",
        ("eye hospital", "eye clinic", "ophthalmologist")),
    "ent": Specialty(
        "Ear, nose & throat (ENT)", r"ent\b|e\.n\.t|throat|otolaryn|otorhino|\bear\b",
        r"\bears?\b|earache|throat|tonsil|sinus|nose ?bleed|hearing|\bgala\b",
        ("ENT clinic", "ENT hospital", "ENT specialist")),
    "dentistry": Specialty(
        "Teeth (Dental)", r"dental|dent|teeth|tooth|smile|orthodont",
        r"tooth|teeth|\bgums?\b|dental|toothache|daant",
        ("dental clinic",)),
    "psychiatry": Specialty(
        "Mental health (Psychiatry)", r"mind|mental|psych|addiction|manas",
        r"anxi|depress|panic|suicid|self.?harm|mental|stress|insomnia|can'?t sleep|hallucinat",
        ("psychiatrist", "mental health clinic")),
    "endocrinology": Specialty(
        "Diabetes & hormones (Endocrinology)", r"diabet|sugar|endocrin|thyroid",
        r"diabet|sugar (level|high|low)|blood sugar|thyroid|insulin",
        ("diabetologist", "diabetes clinic", "thyroid clinic")),
    "general": Specialty(
        "General medicine", r"multi ?speciality|multi ?specialty|polyclinic|general|family",
        r"$^", ("hospital",)),
}
GENERAL = "general"
SEVERITIES = ("LOW", "MODERATE", "HIGH", "EMERGENCY")
_SEVERE = {"HIGH", "EMERGENCY"}

# Amazon Location category ids -> our kind. Anything else (pharmacies, labs,
# shops that share a category) is not a place to get care.
_KINDS = {
    "hospital": "hospital", "hospital_emergency_room": "hospital",
    "medical_services-clinics": "clinic", "hospital_or_health_care_facility": "clinic",
    "family-general_practice_physicians": "doctor", "dentist-dental_office": "dentist",
}
_KIND_RANK = ("hospital", "clinic", "doctor", "dentist")
_HOSPITALS = ["hospital"]
_CLINICS = ["medical_services-clinics", "family-general_practice_physicians"]
_DENTISTS = ["dentist-dental_office"]
# Not modern-medicine care (the app triages for doctors and hospitals) or not
# a place that treats people: diagnostics, pharmacies, opticians, vets.
_NOT_CARE = re.compile(r"ayurved|homo?eo|unani|siddha|naturopath|yoga|\bspa\b|wellness|veterinar|\bpet\b|animal|optical|optician|\blens", re.I)
_SUPPORT_ONLY = re.compile(r"patholog|\blabs?\b|diagnostic|\bscans?\b|imaging|x-?ray|pharma|chemist|medical store|medicos?\b", re.I)
_CARE_WORD = re.compile(r"hospital|clinic|nursing home|polyclinic|\bdr\.?\s|doctor", re.I)

_limiter = SlidingWindowLimiter(lambda: config.NEARBY_CARE_PER_MINUTE)
_client = None
_client_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix="nearby")


def reset_for_tests() -> None:
    global _client
    _limiter.reset()
    _client = None


# --- care focus -------------------------------------------------------------

def infer_specialty(text: str) -> str:
    """The specialty the person's own words point to (most keyword hits; ties
    go to the earlier, more urgent specialty), else general medicine."""
    best, hits = GENERAL, 0
    low = (text or "").lower()
    for key, spec in SPECIALTIES.items():
        n = len(re.findall(spec.text, low))
        if n > hits:
            best, hits = key, n
    return best


def _short(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def care_focus(llm_care, user_text: str, likely_causes: Optional[list[str]] = None) -> dict:
    """``{issue, specialty}`` for an assessment: the LLM's when valid, else ours."""
    care = llm_care if isinstance(llm_care, dict) else {}
    spec = str(care.get("specialty") or "").strip().lower()
    if spec not in SPECIALTIES:
        spec = infer_specialty(user_text)
    issue = _short(care.get("issue"), 60)
    if not issue and likely_causes:
        issue = _short(re.split(r"[(\[,;]", likely_causes[0])[0], 60)
    return {"issue": issue or SPECIALTIES[spec].label, "specialty": spec}


def _parse_reply(m: dict) -> Optional[dict]:
    try:
        parsed = json.loads(m.get("content") or "")
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _find_assessment(messages: list[dict], message_id: Optional[str]) -> tuple[Optional[dict], int]:
    """(reply JSON, its index): the message ``message_id``, else the newest
    assistant reply with a severity. (None, len) when there is none."""
    for i in range(len(messages) - 1, -1, -1):
        m = messages[i]
        if m.get("role") != "assistant" or (message_id and m.get("id") != message_id):
            continue
        parsed = _parse_reply(m)
        if parsed is not None and (parsed.get("severity") or message_id):
            return parsed, i
    return None, len(messages)


def focus_from_messages(messages: list[dict], message_id: Optional[str] = None) -> dict:
    """The care focus of one assessment in a stored conversation (``message_id``,
    else the newest one with a severity). Old replies have no ``care``: it is
    inferred from what the person wrote up to that reply."""
    target, upto = _find_assessment(messages, message_id)
    if message_id and target is None:
        raise NearbyNotFound("Message not found.")
    user_text = " ".join(str(m.get("content") or "") for m in messages[:upto] if m.get("role") == "user")
    target = target or {}
    causes = target.get("likelyCauses") if isinstance(target.get("likelyCauses"), list) else None
    focus = care_focus(target.get("care"), user_text, causes)
    focus["severity"] = target.get("severity") if target.get("severity") in SEVERITIES else None
    if not target and not user_text.strip():
        focus["issue"] = ""  # nothing discussed yet: plain "hospitals near you"
    return focus


# --- places -----------------------------------------------------------------

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _places_client():
    global _client
    with _client_lock:
        if _client is None:
            import boto3
            from botocore.config import Config
            _client = boto3.client(
                "geo-places", region_name=config.NEARBY_PLACES_REGION,
                config=Config(connect_timeout=3, read_timeout=config.NEARBY_CALL_TIMEOUT, retries={"max_attempts": 2}),
            )
        return _client


def _nearby_call(lat: float, lng: float, radius_m: int, categories: list[str]) -> list[dict]:
    resp = _places_client().search_nearby(
        QueryPosition=[lng, lat], QueryRadius=radius_m, MaxResults=20,
        Filter={"IncludeCategories": categories}, AdditionalFeatures=["Contact"],
    )
    return resp.get("ResultItems") or []


def _text_call(lat: float, lng: float, radius_m: int, query: str) -> list[dict]:
    resp = _places_client().search_text(
        QueryText=query, Filter={"Circle": {"Center": [lng, lat], "Radius": radius_m}}, MaxResults=10,
        AdditionalFeatures=["Contact"],
    )
    return resp.get("ResultItems") or []


def _is_care_place(name: str, pos: list, kinds: list[str]) -> bool:
    if not name or len(pos) != 2 or not kinds or _NOT_CARE.search(name):
        return False
    return not (_SUPPORT_ONLY.search(name) and not _CARE_WORD.search(name))


def _short_address(item: dict, name: str) -> Optional[str]:
    """The address without the place name it usually starts with."""
    label = _short((item.get("Address") or {}).get("Label"), 200)
    if label.lower().startswith(name.lower()):
        label = label[len(name):].lstrip(", ")
    return label[:120] or None


def to_place(item: dict, specialty: str, lat: float, lng: float) -> Optional[dict]:
    """One search result as a place to get care, or None (not care, no position)."""
    name = _short(item.get("Title"), 90)
    pos = item.get("Position") or []
    cats = [c.get("Id") for c in item.get("Categories") or [] if isinstance(c, dict)]
    kinds = [_KINDS[c] for c in cats if c in _KINDS]
    if not _is_care_place(name, pos, kinds):
        return None
    kind = min(kinds, key=_KIND_RANK.index)
    if kind != "hospital" and re.search(r"hospital|nursing home", name, re.I):
        kind = "hospital"
    plng, plat = float(pos[0]), float(pos[1])
    name_hit = bool(re.search(r"\b(?:" + SPECIALTIES[specialty].names + ")", name, re.I))
    contacts = item.get("Contacts") or {}
    phones = [p.get("Value") for p in contacts.get("Phones") or [] if p.get("Value")]
    return {
        "id": _short(item.get("PlaceId"), 200),
        "name": name,
        "kind": kind,
        "lat": round(plat, 6),
        "lng": round(plng, 6),
        "distanceKm": round(haversine_km(lat, lng, plat, plng), 2),
        "matchesSpecialty": name_hit or (specialty == "dentistry" and kind == "dentist"),
        "emergency": True if "hospital_emergency_room" in cats else None,
        "address": _short_address(item, name),
        "phone": phones[0][:40] if phones else None,
        "_documented": bool(phones or contacts.get("Websites") or item.get("OpeningHours")),
    }


def _kind_bonus(kind: str, severity: Optional[str]) -> float:
    if kind == "hospital":
        return 3.0 if severity in _SEVERE else 1.3
    if severity == "EMERGENCY":
        return 0.25  # a clinic cannot treat an emergency: only when no hospital is near
    if severity == "HIGH":
        return 0.6 if kind == "clinic" else 0.3
    return 1.0


def _effective_km(p: dict, severity: Optional[str], match_bonus: float) -> float:
    """Distance divided by how well the place fits; lower is better."""
    bonus = (match_bonus if p["matchesSpecialty"] else 1.0) * _kind_bonus(p["kind"], severity)
    if severity in _SEVERE and p["emergency"]:
        bonus *= 1.5
    if p["_documented"]:
        bonus *= 1.1  # listed phone/website/hours: usually an established place
    return (p["distanceKm"] + 0.3) / bonus


def rank(places: list[dict], specialty: str, severity: Optional[str]) -> list[dict]:
    """LOW/MODERATE: places that treat this specialty first, then the rest.
    HIGH/EMERGENCY: nearness matters most, so one list scored by effective
    distance (distance / bonus) where hospitals, emergency rooms and the
    specialty raise the bonus."""
    severe = severity in _SEVERE
    if severe or specialty == GENERAL:
        return sorted(places, key=lambda p: _effective_km(p, severity, 2.5 if severe else 1.5))

    def by(p: dict) -> float:
        return _effective_km(p, severity, 1.0)
    return sorted([p for p in places if p["matchesSpecialty"]], key=by) + sorted([p for p in places if not p["matchesSpecialty"]], key=by)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("&", "and"))


def _same_place(a: dict, b: dict) -> bool:
    """One place listed twice (e.g. "Bowring & Lady Curzon" / "Bowring And Lady Cuzron")."""
    if haversine_km(a["lat"], a["lng"], b["lat"], b["lng"]) >= 0.4:
        return False
    na, nb = _norm(a["name"]), _norm(b["name"])
    return na == nb or SequenceMatcher(None, na, nb).ratio() >= 0.88


def _dedupe(places: list[dict]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for p in sorted(places, key=lambda x: x["distanceKm"]):
        if p["id"] and p["id"] in seen:
            continue
        if any(_same_place(p, q) for q in out):
            continue
        seen.add(p["id"])
        out.append(p)
    return out


def _gather(lat: float, lng: float, specialty: str, near_m: int, far_m: int, deadline: float) -> list[dict]:
    jobs = [(_nearby_call, near_m, _HOSPITALS), (_nearby_call, near_m, _CLINICS)]
    if specialty == "dentistry":
        jobs.append((_nearby_call, near_m, _DENTISTS))
    if specialty != GENERAL:
        jobs += [(_text_call, far_m, q) for q in SPECIALTIES[specialty].queries]
    futures = [_pool.submit(fn, lat, lng, radius, arg) for fn, radius, arg in jobs]
    items, failed = [], 0
    for f in futures:
        try:
            items += f.result(timeout=max(0.5, deadline - time.monotonic()))
        except Exception as exc:  # noqa: BLE001 - one failed query must not sink the others
            failed += 1
            logger.warning("Places search failed: %s", type(exc).__name__)
    if failed == len(futures):
        raise NearbyUnavailable("Nearby search is unavailable right now.")
    return items


def search(lat: float, lng: float, specialty: str, severity: Optional[str], limit: int = 3) -> tuple[list[dict], float]:
    """Top places and the radius searched (km). Widens once when the area is sparse."""
    deadline = time.monotonic() + config.NEARBY_TIME_BUDGET_SECONDS
    near, far = config.NEARBY_RADIUS_M, config.NEARBY_SPECIALTY_RADIUS_M
    places: list[dict] = []
    for used in (near, far):  # noqa: B007 - `used` is read after the loop
        items = _gather(lat, lng, specialty, used, far, deadline)
        places = _dedupe([p for p in (to_place(i, specialty, lat, lng) for i in items) if p])
        if len(places) >= limit or used >= far or time.monotonic() > deadline - 3:
            break
    top = rank(places, specialty, severity)[:limit]
    for p in top:
        p.pop("_documented", None)
    return top, used / 1000


def nearby(user_id: str, *, lat: float, lng: float, specialty: Optional[str] = None, issue: Optional[str] = None,
           severity: Optional[str] = None, consultation_id: Optional[str] = None, message_id: Optional[str] = None,
           limit: int = 3) -> dict:
    if not _limiter.allow(user_id):
        raise NearbyRateLimited("Too many nearby searches. Try again in a minute.")
    focus = {"issue": issue or "", "specialty": specialty, "severity": severity}
    if consultation_id and not specialty:
        from app.services import consultation_service  # late: keeps this module free of DynamoDB at import
        if not consultation_service.consultation_exists(user_id, consultation_id):
            raise NearbyNotFound("Consultation not found.")
        stored = focus_from_messages(consultation_service.list_messages(user_id, consultation_id), message_id)
        focus = {"issue": issue or stored["issue"], "specialty": stored["specialty"], "severity": severity or stored["severity"]}
    spec = focus["specialty"] if focus["specialty"] in SPECIALTIES else GENERAL
    started = time.monotonic()
    places, radius_km = search(lat, lng, spec, focus["severity"], limit)
    logger.info("nearby care specialty=%s severity=%s results=%d ms=%d", spec, focus["severity"], len(places),
                int((time.monotonic() - started) * 1000))
    return {
        "issue": focus["issue"] or "",
        "specialty": spec,
        "specialtyLabel": SPECIALTIES[spec].label,
        "searchTerm": SPECIALTIES[spec].queries[0],
        "severity": focus["severity"],
        "places": places,
        "radiusKm": radius_km,
        "source": "Amazon Location Service",
    }
