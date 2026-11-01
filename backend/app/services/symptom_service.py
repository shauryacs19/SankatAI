"""Symptom progression tracker.

Entries live in the existing chat-history table (hash ``user_id``) under their
own sort-key prefix ``SYMPTOM#<recorded_at>#<id>``, so no new table is needed and
the consultation/message queries (``CONSULT#`` / ``MSG#`` prefixes) never see
them. Every read and write is keyed by the caller's ``user_id``.

The trend (increasing / decreasing / stable) is plain arithmetic on the
recorded severities; the optional AI summary only describes those numbers and
never claims a medical outcome.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from boto3.dynamodb.conditions import Key

from app.core import config
from app.core.rate_limit import SlidingWindowLimiter
from app.integrations.aws.dynamo_client import get_chat_table, now_iso, short_id

logger = logging.getLogger("sankatai")

PREFIX = "SYMPTOM#"
MAX_ENTRIES = 1000  # per user, newest kept in reads
STABLE_BAND = 1.0  # average change (points) below this counts as stable
SUMMARY_DISCLAIMER = ("AI summary of the numbers you recorded. A change in your ratings does not confirm that a "
                      "condition is improving or getting worse. Talk to a doctor about any concern.")

summary_limiter = SlidingWindowLimiter(lambda: 10)


class SymptomNotFound(Exception):
    pass


class SummaryRateLimited(Exception):
    pass


def _view(item: dict) -> dict:
    return {
        "id": item["symptom_id"], "name": item["name"], "severity": int(item["severity"]),
        "recordedAt": item["recorded_at"], "notes": item.get("notes") or "", "createdAt": item.get("created_at"),
    }


def _iso(dt: Optional[datetime]) -> str:
    return (dt or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def add_entry(user_id: str, name: str, severity: int, recorded_at: Optional[datetime], notes: str) -> dict:
    sid = short_id()
    when = _iso(recorded_at)
    item = {
        "user_id": user_id, "chat_id": f"{PREFIX}{when}#{sid}", "kind": "symptom", "symptom_id": sid,
        "name": name, "name_key": name.lower(), "severity": severity, "recorded_at": when,
        "notes": notes, "created_at": now_iso(),
    }
    get_chat_table().put_item(Item=item)
    return _view(item)


def _items(user_id: str) -> list[dict]:
    table = get_chat_table()
    kwargs = {"KeyConditionExpression": Key("user_id").eq(user_id) & Key("chat_id").begins_with(PREFIX),
              "ScanIndexForward": False}
    items: list[dict] = []
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp or len(items) >= MAX_ENTRIES:
            return items[:MAX_ENTRIES]
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def list_entries(user_id: str) -> list[dict]:
    """Newest first."""
    return [_view(i) for i in _items(user_id)]


def delete_entry(user_id: str, symptom_id: str) -> None:
    for item in _items(user_id):
        if item["symptom_id"] == symptom_id:
            get_chat_table().delete_item(Key={"user_id": user_id, "chat_id": item["chat_id"]})
            return
    raise SymptomNotFound("Symptom entry not found.")


def trend_of(entries: list[dict]) -> dict:
    """Direction of one symptom's ratings. ``entries`` oldest first.

    Average of the later half minus average of the earlier half: >= +1 point is
    "increasing", <= -1 "decreasing", otherwise "stable". One entry = "insufficient".
    """
    sev = [e["severity"] for e in entries]
    out = {"count": len(sev), "first": sev[0] if sev else None, "latest": sev[-1] if sev else None,
           "firstAt": entries[0]["recordedAt"] if entries else None,
           "latestAt": entries[-1]["recordedAt"] if entries else None}
    if len(sev) < 2:
        return {**out, "direction": "insufficient", "change": None}
    half = len(sev) // 2
    early, late = sev[:half] or sev[:1], sev[-half:] or sev[-1:]
    change = round(sum(late) / len(late) - sum(early) / len(early), 1)
    direction = "increasing" if change >= STABLE_BAND else "decreasing" if change <= -STABLE_BAND else "stable"
    return {**out, "direction": direction, "change": change}


def grouped(entries: list[dict]) -> list[dict]:
    """Per-symptom series (oldest first) + trend, most recently recorded first."""
    by: dict[str, list[dict]] = {}
    for e in sorted(entries, key=lambda e: e["recordedAt"]):
        by.setdefault(e["name"].lower(), []).append(e)
    out = [{"name": series[-1]["name"], "entries": series, "trend": trend_of(series)} for series in by.values()]
    out.sort(key=lambda s: s["trend"]["latestAt"] or "", reverse=True)
    return out


def overview(user_id: str) -> dict:
    entries = list_entries(user_id)
    return {"entries": entries, "symptoms": grouped(entries)}


def _fallback_summary(name: str, t: dict) -> str:
    if t["direction"] == "insufficient":
        return f"You have one {name} rating so far ({t['latest']}/10). Add more entries over the coming days to see a trend."
    words = {"increasing": "gone up", "decreasing": "gone down", "stable": "stayed about the same"}[t["direction"]]
    return (f"Across {t['count']} entries your {name} ratings have {words}: from {t['first']}/10 to "
            f"{t['latest']}/10 (average change {t['change']:+} points).")


_SUMMARY_PROMPT = (
    "You describe a patient's own symptom log. Output JSON {\"summary\": \"...\"}: 2-3 plain sentences (max 70 words) "
    "describing how the recorded severity ratings (1-10) changed over time and anything notable in their notes. "
    "Describe only the recorded numbers. Never diagnose, never say the condition is improving, healing, worsening or "
    "resolved, never reassure. If the latest rating is 8 or more, or it keeps rising, suggest talking to a doctor."
)


def ai_summary(user_id: str, name: str) -> dict:
    """AI wording of one symptom's trend; deterministic text when AI is unavailable."""
    from app.integrations.ai.openai_provider import get_provider
    from app.services.triage_service import ai_key_configured

    series = next((s for s in grouped(list_entries(user_id)) if s["name"].lower() == name.strip().lower()), None)
    if series is None:
        raise SymptomNotFound("No entries recorded for this symptom.")
    t = series["trend"]
    base = {"name": series["name"], "trend": t, "disclaimer": SUMMARY_DISCLAIMER}
    if not ai_key_configured() or len(series["entries"]) < 2:
        return {**base, "summary": _fallback_summary(series["name"], t), "source": "rules"}
    if not summary_limiter.allow(user_id):
        raise SummaryRateLimited("Too many summaries. Try again in a minute.")
    log = "\n".join(f"{e['recordedAt'][:16].replace('T', ' ')} severity {e['severity']}/10"
                    + (f" note: {e['notes'][:200]}" if e["notes"] else "") for e in series["entries"][-30:])
    try:
        raw = get_provider().generate([
            {"role": "system", "content": _SUMMARY_PROMPT},
            {"role": "user", "content": f"Symptom: {series['name']}\nComputed trend: {t['direction']}\nLog (oldest first):\n{log}"},
        ], timeout=min(config.AI_TIMEOUT, 20))
        text = " ".join(str(json.loads(raw).get("summary") or "").split())[:600]
        if text:
            return {**base, "summary": text, "source": "ai"}
    except Exception as err:  # noqa: BLE001 - fall back to the computed wording
        logger.warning("Symptom summary failed (%s).", type(err).__name__)
    return {**base, "summary": _fallback_summary(series["name"], t), "source": "rules"}
