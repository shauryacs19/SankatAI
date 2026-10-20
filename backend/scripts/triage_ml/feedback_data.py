"""Turn stored Yes/No feedback into weighted training examples.

Only FINAL assessments carry a severity. Labels:
  * reviewed ``label`` on the row (set by a clinician/admin)      weight 2.0
  * "yes" -> the severity shown was right                          weight 1.0
  * "no" + wrong_severity + direction higher -> one level up       weight 0.5
  * "no" + wrong_severity + direction lower  -> one level down     weight 0.5,
    never below the red-flag floor and never out of EMERGENCY
  * other "no" reasons say nothing about severity -> not used here (they feed
    the prompt/question bandit instead).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

from boto3.dynamodb.conditions import Key

from app.ml import red_flags
from app.ml.features import SEVERITIES, TRISTATE, Features
from app.ml.slots import _AGE_YEARS, _DURATION_DAYS, _PAIN_SCORE
from scripts.triage_ml.dataset import Example


def months_back(n: int, now: Optional[datetime] = None) -> list[str]:
    now = now or datetime.now(timezone.utc)
    y, m = now.year, now.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out


def read_items(table, months: Iterable[str]) -> list[dict]:
    items: list[dict] = []
    for month in months:
        kwargs = {"KeyConditionExpression": Key("pk").eq(f"FB#{month}")}
        while True:
            resp = table.query(**kwargs)
            items += resp.get("Items", [])
            if "LastEvaluatedKey" not in resp:
                break
            kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return items


def features_from_summary(summary: dict, text: str) -> Features:
    f = Features(text=text or "")
    f.age = _AGE_YEARS.get(summary.get("ageBand"))
    f.duration_days = _DURATION_DAYS.get(summary.get("durationBand"))
    f.pain = _PAIN_SCORE.get(summary.get("painBand"))
    for k in TRISTATE:
        if summary.get(k) in (1, -1):
            f.flags[k] = int(summary[k])
    for k in ("temp_c", "heart_rate", "spo2", "sbp", "resp_rate"):
        if summary.get(k) is not None:
            setattr(f, k, float(summary[k]))
    image = summary.get("image") or {}
    if image:
        f.image_cue, f.image_region = image.get("cue"), image.get("region")
    f.red_flags = red_flags.detect(f)
    return f


def label_of(item: dict) -> Optional[tuple[str, float]]:
    if item.get("mode") != "final" or item.get("final_severity") not in SEVERITIES:
        return None
    if item.get("label") in SEVERITIES:
        return item["label"], 2.0
    shown = item["final_severity"]
    if item.get("feedback") == "yes":
        return shown, 1.0
    if item.get("feedback") == "no" and item.get("reason") == "wrong_severity":
        i = SEVERITIES.index(shown)
        if item.get("direction") == "higher" and i < 3:
            return SEVERITIES[i + 1], 0.5
        if item.get("direction") == "lower" and 0 < i < 3:
            return SEVERITIES[i - 1], 0.5
    return None


def to_examples(items: Iterable[dict]) -> list[Example]:
    out = []
    for item in items:
        lab = label_of(item)
        if not lab:
            continue
        f = features_from_summary(item.get("features") or {}, item.get("query") or "")
        severity, weight = lab
        floor_level, _ = red_flags.floor(f)
        if floor_level and SEVERITIES.index(severity) < SEVERITIES.index(floor_level):
            severity = floor_level  # a downgrade can never cross the safety floor
        out.append(Example([], severity, f"fb-{item.get('sk', '')}", "feedback", weight=weight, features=f))
    return out
