"""Platform analytics: record real product events, read pre-aggregated metrics.

Write path (never blocks or fails a user request):
  route/service -> ``emit()`` / ``touch_user()`` -> bounded background thread ->
  PutItem raw event (TTL) + atomic ``UpdateItem ADD`` counters.

Read path (admin dashboard): Query/BatchGetItem over the aggregates only. No
table scans. A value the platform does not record is returned as
``{"value": None, "unavailable": "<reason>"}``, never as a made-up number.

Privacy: events carry an allow-listed metadata schema (enums, ints, dates).
Free text, prompts, symptoms, diagnoses, documents, names and emails cannot be
recorded because ``sanitize_metadata`` drops every key and value not on the
list. Users appear only as ``sha256(user_id + ANALYTICS_SALT)``; triage and
emergency events carry no user hash at all.
"""

from __future__ import annotations

import hashlib
import logging
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional

from app.core import config
from app.repositories import analytics_repository as repo

logger = logging.getLogger("sankatai.analytics")

EVENT_TYPES = {
    "USER_REGISTERED", "USER_LOGIN", "AI_REQUEST", "AI_RESPONSE", "AI_RESPONSE_FAILED",
    "FEEDBACK_UPVOTE", "FEEDBACK_DOWNVOTE", "TRIAGE_COMPLETED", "EMERGENCY_CASE",
    "DOCUMENT_UPLOADED", "CHAT_CREATED",
}
# Events that must never be linkable to a user, even pseudonymously.
_ANONYMOUS_EVENTS = {"TRIAGE_COMPLETED", "EMERGENCY_CASE"}

SEVERITIES = ("EMERGENCY", "HIGH", "MODERATE", "LOW")
_MINUTE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")

# key -> validator. Anything else is dropped before it can be stored.
_METADATA_SCHEMA: dict[str, Callable[[Any], bool]] = {
    "input_type": lambda v: v in {"text", "voice", "image"},
    "status": lambda v: v in {"success", "failed"},
    "source": lambda v: v in {"ai", "offline"},
    "severity": lambda v: v in SEVERITIES,
    "scope": lambda v: v in {"vault", "chat"},
    "kind": lambda v: v in {"photo", "document"},
    "action": lambda v: v in {"set", "retract"},
    "has_attachments": lambda v: isinstance(v, bool),
    "response_time_ms": lambda v: isinstance(v, int) and not isinstance(v, bool) and 0 <= v < 3_600_000,
    "vote_at": lambda v: isinstance(v, str) and bool(_MINUTE_RE.match(v)),
}

_HOURLY_TTL_SECONDS = 8 * 86400
_FIVE_MINUTE_TTL_SECONDS = 2 * 3600
_MAX_PENDING = 2000
_SET_WINDOW_MAX_DAYS = 92  # distinct-user unions are computed for ranges up to this


# --- time --------------------------------------------------------------------

def tz() -> timezone:
    return timezone(timedelta(minutes=config.ANALYTICS_UTC_OFFSET_MINUTES))


def local_now() -> datetime:
    return datetime.now(timezone.utc).astimezone(tz())


def to_local(ts: str | datetime) -> datetime:
    dt = datetime.fromisoformat(ts) if isinstance(ts, str) else ts
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz())


def day_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def hour_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H")


def minute_key(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M")


def five_minute_key(dt: datetime) -> str:
    return dt.replace(minute=dt.minute - dt.minute % 5, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M")


# --- pseudonymisation + schema ----------------------------------------------

def user_hash(user_id: Optional[str]) -> Optional[str]:
    """sha256(user_id + salt), or None when there is no id or no salt."""
    if not user_id or not config.ANALYTICS_SALT:
        return None
    return hashlib.sha256(f"{user_id}{config.ANALYTICS_SALT}".encode()).hexdigest()


def _member(kind: str, raw_id: str) -> Optional[str]:
    """16-hex set member for a distinct-count set (salted; None without salt)."""
    if not raw_id or not config.ANALYTICS_SALT:
        return None
    return hashlib.sha256(f"{kind}:{raw_id}{config.ANALYTICS_SALT}".encode()).hexdigest()[:16]


def sanitize_metadata(metadata: Optional[dict]) -> dict:
    return {k: v for k, v in (metadata or {}).items() if k in _METADATA_SCHEMA and _METADATA_SCHEMA[k](v)}


# --- background execution ----------------------------------------------------

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="analytics")
_pending = threading.BoundedSemaphore(_MAX_PENDING)
_sync = False  # tests run writes inline
_last_error_log = 0.0


def set_sync(value: bool) -> None:
    global _sync
    _sync = value


def _log_failure(what: str, error: Exception) -> None:
    # Rate-limited, and only the exception type: never event contents.
    global _last_error_log
    now = time.monotonic()
    if now - _last_error_log > 60:
        _last_error_log = now
        logger.warning("analytics %s failed: %s", what, type(error).__name__)


def _submit(fn: Callable, *args) -> None:
    if _sync:
        try:
            fn(*args)
        except Exception as error:  # noqa: BLE001 - analytics must never raise
            _log_failure(fn.__name__, error)
        return
    if not _pending.acquire(blocking=False):
        _log_failure("enqueue", RuntimeError("queue full; event dropped"))
        return

    def run():
        try:
            fn(*args)
        except Exception as error:  # noqa: BLE001
            _log_failure(fn.__name__, error)
        finally:
            _pending.release()

    try:
        _executor.submit(run)
    except RuntimeError as error:  # interpreter shutting down
        _pending.release()
        _log_failure("enqueue", error)


# --- live-since / backfill markers (cached) ----------------------------------

_markers: dict[str, Any] = {"live_since": None, "backfill_done": False, "backfill_checked": 0.0, "since": set()}
_markers_lock = threading.Lock()


def _live_since() -> str:
    """UTC ISO timestamp of the first live event (created on first use)."""
    with _markers_lock:
        cached = _markers["live_since"]
    if cached:
        return cached
    item = repo.put_meta_if_absent("LIVE_SINCE", {"ts": datetime.now(timezone.utc).isoformat()})
    with _markers_lock:
        _markers["live_since"] = item.get("ts")
    return item.get("ts")


def _backfill_done() -> bool:
    with _markers_lock:
        if _markers["backfill_done"] or time.monotonic() - _markers["backfill_checked"] < 600:
            return _markers["backfill_done"]
    done = (repo.get_meta("BACKFILL") or {}).get("status") == "done"
    with _markers_lock:
        _markers["backfill_done"] = done
        _markers["backfill_checked"] = time.monotonic()
    return done


def _mark_since(metric: str, day: str) -> None:
    with _markers_lock:
        if metric in _markers["since"]:
            return
    repo.lower_since(metric, day)
    with _markers_lock:
        _markers["since"].add(metric)


def reset_caches() -> None:
    """Tests only: forget cached markers and touched ids."""
    with _markers_lock:
        _markers.update(live_since=None, backfill_done=False, backfill_checked=0.0, since=set())
    with _touch_lock:
        _touched.update(day=None, users=set(), chats=set(), bucket=None, bucket_users=set(), seen=set())


# --- emit --------------------------------------------------------------------

def emit(event_type: str, user_id: Optional[str] = None, **metadata) -> None:
    """Queue one event. Unknown event types raise (a programming error); any
    storage failure is swallowed and logged."""
    if event_type not in EVENT_TYPES:
        raise ValueError(f"unknown analytics event {event_type!r}")
    if not config.ANALYTICS_ENABLED:
        return
    now = datetime.now(timezone.utc)
    event = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "timestamp": now.isoformat(),
        "user_hash": None if event_type in _ANONYMOUS_EVENTS else user_hash(user_id),
        "metadata": sanitize_metadata(metadata),
    }
    _submit(_record, event)


def _counters_for(event: dict) -> list[tuple[str, int, Optional[int]]]:
    """(metric, count delta, sum delta) for one event."""
    md = event["metadata"]
    kind = event["event_type"]
    if kind == "USER_REGISTERED":
        return [("users_new", 1, None)]
    if kind == "AI_REQUEST":
        return [("ai_requests", 1, None), (f"ai_requests_{md.get('input_type', 'text')}", 1, None)]
    if kind == "AI_RESPONSE":
        ms = md.get("response_time_ms")
        return [("ai_responses", 1, None)] + ([("ai_latency_ms", 1, ms)] if ms is not None else [])
    if kind == "AI_RESPONSE_FAILED":
        return [("ai_failed", 1, None)]
    if kind in ("FEEDBACK_UPVOTE", "FEEDBACK_DOWNVOTE"):
        metric = "feedback_up" if kind == "FEEDBACK_UPVOTE" else "feedback_down"
        return [(metric, -1 if md.get("action") == "retract" else 1, None)]
    if kind == "TRIAGE_COMPLETED" and md.get("severity") in SEVERITIES:
        return [("triage_total", 1, None), (f"triage_{md['severity'].lower()}", 1, None)]
    if kind == "EMERGENCY_CASE":
        return [("emergency_cases", 1, None)]
    if kind == "DOCUMENT_UPLOADED" and md.get("scope") in ("vault", "chat"):
        return [(f"uploads_{md['scope']}", 1, None)]
    if kind == "CHAT_CREATED":
        return [("chats_created", 1, None)]
    return []  # USER_LOGIN: accepted by the schema, but nothing emits it today


def _record(event: dict) -> None:
    live_since = _live_since()
    when = to_local(event["timestamp"])
    md = event["metadata"]
    counter_time = when
    if md.get("action") == "retract":
        # A retraction decrements the day the vote was CAST. Votes cast before
        # live tracking belong to the backfill, which reads the current state,
        # so retracting one of those here would subtract it twice.
        vote_at = md.get("vote_at")
        if not vote_at:
            return
        counter_time = datetime.strptime(vote_at, "%Y-%m-%dT%H:%M").replace(tzinfo=tz())
        if counter_time < to_local(live_since).replace(second=0, microsecond=0):
            return

    repo.put_event({**event, "ttl": int(time.time()) + config.ANALYTICS_EVENT_TTL_DAYS * 86400})
    day, hour = day_key(counter_time), hour_key(counter_time)
    hourly_ttl = int(time.time()) + _HOURLY_TTL_SECONDS
    for metric, count, amount in _counters_for(event):
        repo.add_counter(repo.metric_pk(metric), day, count, amount)
        repo.add_counter(repo.metric_pk(metric), repo.TOTAL_SK, count, amount)
        repo.add_counter(repo.metric_pk(metric, hourly=True), hour, count, amount, ttl=hourly_ttl)
        _mark_since(metric, day_key(when))


# --- distinct users / conversations ------------------------------------------

_touched: dict[str, Any] = {"day": None, "users": set(), "chats": set(), "bucket": None, "bucket_users": set(), "seen": set()}
_touch_lock = threading.Lock()


def touch_user(user_id: Optional[str]) -> None:
    """Record that a user made an authenticated request (DAU/WAU/MAU, active
    now, first-seen registration). At most one write per user per day and per
    5-minute window per process, and nothing at all without a salt."""
    if not config.ANALYTICS_ENABLED or not user_id:
        return
    member = _member("user", user_id)
    if not member:
        return
    now = local_now()
    day, bucket = day_key(now), five_minute_key(now)
    with _touch_lock:
        if _touched["day"] != day:
            _touched.update(day=day, users=set(), chats=set())
        if _touched["bucket"] != bucket:
            _touched.update(bucket=bucket, bucket_users=set())
        new_day = member not in _touched["users"]
        new_bucket = member not in _touched["bucket_users"]
        if not (new_day or new_bucket):
            return
        _touched["users"].add(member)
        _touched["bucket_users"].add(member)
    _submit(_record_touch, user_id, member, day, bucket, new_day, new_bucket)


def _record_touch(user_id: str, member: str, day: str, bucket: str, new_day: bool, new_bucket: bool) -> None:
    try:
        shard = repo.shard_of(member)
        if new_day:
            repo.add_to_set(repo.set_pk("active_users", shard), day, member)
            _mark_since("active_users", day)
            _register_if_new(user_id, day)
        if new_bucket:
            repo.add_to_set(repo.set_pk("active_users", shard, five_minute=True), bucket, member,
                            ttl=int(time.time()) + _FIVE_MINUTE_TTL_SECONDS)
    except Exception:
        # Forget the member so a later request retries the write.
        with _touch_lock:
            _touched["users"].discard(member)
            _touched["bucket_users"].discard(member)
        raise


def _register_if_new(user_id: str, day: str) -> None:
    """USER_REGISTERED the first time a user is ever seen. Gated on the
    backfill having marked every pre-existing Cognito user, otherwise existing
    users would be counted as new on the day tracking started."""
    uh = user_hash(user_id)
    with _touch_lock:
        if uh in _touched["seen"]:
            return
    if not _backfill_done():
        return
    if repo.mark_first_seen(uh, day):
        _record({
            "event_id": str(uuid.uuid4()),
            "event_type": "USER_REGISTERED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_hash": uh,
            "metadata": {},
        })
    with _touch_lock:
        if len(_touched["seen"]) > 100_000:
            _touched["seen"].clear()
        _touched["seen"].add(uh)


def touch_chat(consultation_id: str) -> None:
    """Record that a conversation had a message today (active conversations)."""
    if not config.ANALYTICS_ENABLED:
        return
    member = _member("chat", consultation_id)
    if not member:
        return
    day = day_key(local_now())
    with _touch_lock:
        if _touched["day"] != day:
            _touched.update(day=day, users=set(), chats=set())
        if member in _touched["chats"]:
            return
        _touched["chats"].add(member)

    def write():
        try:
            repo.add_to_set(repo.set_pk("active_chats", repo.shard_of(member)), day, member)
            _mark_since("active_chats", day)
        except Exception:
            with _touch_lock:
                _touched["chats"].discard(member)
            raise

    _submit(write)


# --- read side ---------------------------------------------------------------

class RangeError(ValueError):
    pass


def metric(value: Optional[float]) -> dict:
    return {"value": value, "unavailable": None}


def unavailable(reason: str) -> dict:
    return {"value": None, "unavailable": reason}


def _days(start: date, end: date) -> list[str]:
    return [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]


def parse_range(from_day: Optional[str], to_day: Optional[str], granularity: str = "day") -> dict:
    today = local_now().date()
    try:
        end = date.fromisoformat(to_day) if to_day else today
        start = date.fromisoformat(from_day) if from_day else end - timedelta(days=29)
    except ValueError as exc:
        raise RangeError("Dates must be YYYY-MM-DD.") from exc
    end = min(end, today)
    if start > end:
        raise RangeError("'from' must be on or before 'to'.")
    if (end - start).days > 365:
        raise RangeError("The range can be at most 366 days.")
    if granularity not in ("day", "hour"):
        raise RangeError("granularity must be 'day' or 'hour'.")
    if granularity == "hour" and (end - start).days > 6:
        raise RangeError("Hourly granularity is limited to 7 days.")
    days = _days(start, end)
    labels = [f"{d}T{h:02d}" for d in days for h in range(24)] if granularity == "hour" else days
    return {"start": start, "end": end, "days": days, "labels": labels, "granularity": granularity}


class _Reader:
    """Per-request memo so each aggregate is fetched once per response."""

    def __init__(self, rng: dict):
        self.rng = rng
        self.hourly = rng["granularity"] == "hour"
        self._daily: dict[str, dict] = {}
        self._hourly: dict[str, dict] = {}
        self._totals: Optional[dict] = None
        self._meta: Optional[dict] = None
        self._sets: dict[tuple[str, str], set] = {}

    def meta(self) -> dict:
        if self._meta is None:
            self._meta = repo.all_meta()
        return self._meta

    def since(self, name: str) -> Optional[str]:
        return (self.meta().get(f"SINCE#{name}") or {}).get("day")

    def daily(self, name: str) -> dict:
        if name not in self._daily:
            self._daily[name] = repo.query_counters(repo.metric_pk(name), self.rng["days"][0], self.rng["days"][-1])
        return self._daily[name]

    def hourly_counts(self, name: str) -> dict:
        if name not in self._hourly:
            self._hourly[name] = repo.query_counters(
                repo.metric_pk(name, hourly=True), f"{self.rng['days'][0]}T00", f"{self.rng['days'][-1]}T23")
        return self._hourly[name]

    def total_in_range(self, name: str, field: str = "count") -> Optional[int]:
        """Sum over the range, or None when the metric has never been recorded."""
        if not self.since(name):
            return None
        return sum(v[field] for v in self.daily(name).values())

    def series(self, name: str) -> list[Optional[int]]:
        """One value per label; None before the metric started being recorded."""
        since = self.since(name)
        counts = self.hourly_counts(name) if self.hourly else self.daily(name)
        return [None if not since or label[:10] < since else counts.get(label, {}).get("count", 0)
                for label in self.rng["labels"]]

    def totals(self, names: list[str]) -> dict[str, Optional[dict]]:
        if self._totals is None:
            self._totals = {}
        missing = [n for n in names if n not in self._totals]
        if missing:
            items = repo.batch_get((repo.metric_pk(n), repo.TOTAL_SK) for n in missing)
            for n in missing:
                item = items.get((repo.metric_pk(n), repo.TOTAL_SK))
                self._totals[n] = {"count": int(item.get("count", 0)), "sum": int(item.get("sum", 0))} if item else None
        return {n: self._totals[n] for n in names}

    def load_sets(self, name: str, sks: list[str], five_minute: bool = False) -> dict[str, list[set]]:
        """``{sk: [members per shard]}`` for the requested sort keys."""
        keys = [(repo.set_pk(name, s, five_minute), sk) for sk in sks for s in range(repo.SET_SHARDS)]
        wanted = [k for k in keys if k not in self._sets]
        if wanted:
            items = repo.batch_get(wanted)
            for k in wanted:
                self._sets[k] = set((items.get(k) or {}).get("members") or ())
        return {sk: [self._sets[(repo.set_pk(name, s, five_minute), sk)] for s in range(repo.SET_SHARDS)] for sk in sks}


def _distinct(sets_by_sk: dict[str, list[set]], sks: list[str]) -> int:
    """Distinct members across days. Shards partition the member space, so the
    union is the sum of per-shard unions."""
    return sum(len(set().union(*(sets_by_sk[sk][s] for sk in sks))) for s in range(repo.SET_SHARDS))


def _users_section(r: _Reader, total_users: dict) -> dict:
    rng = r.rng
    new_in_range = r.total_in_range("users_new")
    out = {
        "total": total_users,
        "newInRange": metric(new_in_range) if new_in_range is not None else unavailable(
            "Not recorded yet: run the analytics backfill (scripts/backfill_analytics.py)."),
        "totalRegistered": metric((r.totals(["users_new"])["users_new"] or {}).get("count")) if r.since("users_new") else unavailable(
            "Not recorded yet: run the analytics backfill."),
    }
    new_series = r.series("users_new")

    if not config.ANALYTICS_SALT:
        reason = "ANALYTICS_SALT is not configured, so distinct users are not recorded."
        out.update(activeNow=unavailable(reason), dau=unavailable(reason), wau=unavailable(reason),
                   mau=unavailable(reason), activeInRange=unavailable(reason))
        out["series"] = [{"t": t, "new": n, "active": None} for t, n in zip(rng["labels"], new_series)]
        return out

    since = r.since("active_users")
    # Active now: the current and previous two 5-minute windows.
    now = local_now()
    buckets = [five_minute_key(now - timedelta(minutes=5 * i)) for i in range(3)]
    recent = r.load_sets("active_users", buckets, five_minute=True)
    out["activeNow"] = metric(_distinct(recent, buckets)) if since else unavailable("No authenticated requests recorded yet.")

    end = rng["end"]
    if (end - rng["start"]).days + 1 > _SET_WINDOW_MAX_DAYS:
        reason = f"Distinct-user counts are computed for ranges up to {_SET_WINDOW_MAX_DAYS} days."
        out.update(dau=unavailable(reason), wau=unavailable(reason), mau=unavailable(reason), activeInRange=unavailable(reason))
        out["series"] = [{"t": t, "new": n, "active": None} for t, n in zip(rng["labels"], new_series)]
        return out

    window_start = min(rng["start"], end - timedelta(days=29))
    all_days = _days(window_start, end)
    sets = r.load_sets("active_users", all_days)
    last7 = all_days[-7:]
    last30 = all_days[-30:]

    def since_ok(days: list[str]) -> bool:
        return bool(since) and days[0] >= since

    def partial(days: list[str], label: str) -> dict:
        if not since:
            return unavailable("No authenticated requests recorded yet.")
        value = _distinct(sets, days)
        if since_ok(days):
            return metric(value)
        # Tracking began inside the window: report the partial count honestly.
        return {"value": value, "unavailable": None, "partialSince": since, "note": f"{label} since {since} only"}

    out["dau"] = metric(_distinct(sets, [end.isoformat()])) if since and end.isoformat() >= since else unavailable(
        "Not recorded for this day.")
    out["wau"] = partial(last7, "WAU")
    out["mau"] = partial(last30, "MAU")
    out["activeInRange"] = partial(rng["days"], "Active users")

    if r.hourly:
        active = [None] * len(rng["labels"])  # distinct users are tracked per day, not per hour
    else:
        active = [None if not since or d < since else _distinct(sets, [d]) for d in rng["days"]]
    out["series"] = [{"t": t, "new": n, "active": a} for t, n, a in zip(rng["labels"], new_series, active)]
    return out


def _ai_section(r: _Reader) -> dict:
    labels = r.rng["labels"]
    requests = r.total_in_range("ai_requests")
    responses = r.total_in_range("ai_responses")
    failed = r.total_in_range("ai_failed")
    latency_sum = r.total_in_range("ai_latency_ms", "sum")
    latency_n = r.total_in_range("ai_latency_ms")
    finished = (responses or 0) + (failed or 0)
    not_recorded = unavailable("No AI requests recorded yet.")
    today = day_key(local_now())
    today_counts = repo.query_counters(repo.metric_pk("ai_responses"), today, today)
    totals = r.totals(["ai_responses"])
    return {
        "requests": metric(requests) if requests is not None else not_recorded,
        "responses": metric(responses) if responses is not None else not_recorded,
        "failed": metric(failed or 0) if requests is not None else not_recorded,
        "successRate": metric(round(100 * (responses or 0) / finished, 1)) if finished else unavailable(
            "No completed AI requests in this range."),
        "avgLatencyMs": metric(round(latency_sum / latency_n)) if latency_n else unavailable(
            "Response time is recorded from live tracking onward; none in this range."),
        "totalResponses": metric(totals["ai_responses"]["count"]) if totals["ai_responses"] else not_recorded,
        "responsesToday": metric(today_counts.get(today, {}).get("count", 0)) if r.since("ai_responses") else not_recorded,
        "byInputType": {
            "text": metric(r.total_in_range("ai_requests_text")) if r.since("ai_requests_text") else unavailable("No text requests recorded."),
            "voice": metric(r.total_in_range("ai_requests_voice")) if r.since("ai_requests_voice") else unavailable("No voice requests recorded."),
            "image": unavailable("The AI does not analyse images; attachments are stored, not sent to the model."),
        },
        "series": [
            {"t": t, "requests": q, "responses": s, "failed": f}
            for t, q, s, f in zip(labels, r.series("ai_requests"), r.series("ai_responses"), r.series("ai_failed"))
        ],
    }


def _feedback_section(r: _Reader) -> dict:
    up = r.total_in_range("feedback_up")
    down = r.total_in_range("feedback_down")
    recorded = up is not None or down is not None
    votes = (up or 0) + (down or 0)
    none = unavailable("No feedback recorded yet.")
    return {
        "up": metric(up or 0) if recorded else none,
        "down": metric(down or 0) if recorded else none,
        "ratio": metric(round(100 * (up or 0) / votes, 1)) if votes else unavailable("No votes in this range."),
        "series": [{"t": t, "up": u, "down": d}
                   for t, u, d in zip(r.rng["labels"], r.series("feedback_up"), r.series("feedback_down"))],
    }


def _triage_section(r: _Reader) -> dict:
    total = r.total_in_range("triage_total")
    by = {s: r.total_in_range(f"triage_{s.lower()}") for s in SEVERITIES}
    series = {s: r.series(f"triage_{s.lower()}") for s in SEVERITIES}
    none = unavailable("No triage results recorded yet.")
    return {
        "total": metric(total) if total is not None else none,
        "bySeverity": {s: metric(by[s] or 0) if total is not None else none for s in SEVERITIES},
        "emergency": metric(r.total_in_range("emergency_cases") or 0) if total is not None else none,
        "series": [{"t": t, **{s: series[s][i] for s in SEVERITIES}} for i, t in enumerate(r.rng["labels"])],
    }


def _activity_section(r: _Reader) -> dict:
    vault = r.total_in_range("uploads_vault")
    chat = r.total_in_range("uploads_chat")
    started = r.total_in_range("chats_created")
    totals = r.totals(["chats_created"])
    active = unavailable("ANALYTICS_SALT is not configured.") if not config.ANALYTICS_SALT else None
    if active is None:
        since = r.since("active_chats")
        if not since:
            active = unavailable("No conversation activity recorded yet.")
        elif (r.rng["end"] - r.rng["start"]).days + 1 > _SET_WINDOW_MAX_DAYS:
            active = unavailable(f"Computed for ranges up to {_SET_WINDOW_MAX_DAYS} days.")
        else:
            sets = r.load_sets("active_chats", r.rng["days"])
            active = metric(_distinct(sets, r.rng["days"]))
            if r.rng["days"][0] < since:
                active.update(partialSince=since)
    return {
        "documentsUploaded": metric(vault) if vault is not None else unavailable("No vault uploads recorded yet."),
        "chatAttachments": metric(chat) if chat is not None else unavailable("No chat attachments recorded yet."),
        "conversationsStarted": metric(started) if started is not None else unavailable("No conversations recorded yet."),
        "conversationsTotal": metric(totals["chats_created"]["count"]) if totals["chats_created"] else unavailable(
            "No conversations recorded yet."),
        "activeConversations": active,
        "series": [{"t": t, "conversations": c, "vault": v, "chat": a} for t, c, v, a in zip(
            r.rng["labels"], r.series("chats_created"), r.series("uploads_vault"), r.series("uploads_chat"))],
    }


SECTIONS = ("users", "ai", "feedback", "triage", "activity")


def get_analytics(rng: dict, sections: tuple[str, ...] = SECTIONS, *, total_users: Optional[dict] = None,
                  api_traffic: Optional[dict] = None) -> dict:
    """Assemble the requested sections for a parsed range. ``total_users`` and
    ``api_traffic`` come from Cognito / CloudWatch via the caller."""
    r = _Reader(rng)
    meta = r.meta()
    out: dict[str, Any] = {
        "range": {"from": rng["days"][0], "to": rng["days"][-1], "granularity": rng["granularity"],
                  "utcOffsetMinutes": config.ANALYTICS_UTC_OFFSET_MINUTES, "labels": rng["labels"]},
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "tracking": {
            "liveSince": (meta.get("LIVE_SINCE") or {}).get("ts"),
            "backfill": (meta.get("BACKFILL") or {}).get("status", "not_run"),
            "saltConfigured": bool(config.ANALYTICS_SALT),
        },
    }
    builders = {
        "users": lambda: _users_section(r, total_users or unavailable("Cognito user count unavailable.")),
        "ai": lambda: _ai_section(r),
        "feedback": lambda: _feedback_section(r),
        "triage": lambda: _triage_section(r),
        "activity": lambda: _activity_section(r),
    }
    for name in sections:
        out[name] = builders[name]()
    if api_traffic is not None:
        out["api"] = api_traffic
    if set(SECTIONS) <= set(sections):
        out["kpis"] = {
            "totalUsers": out["users"]["total"],
            "activeUsers": out["users"]["activeNow"],
            "aiResponses": out["ai"]["responses"],
            "emergencyCases": out["triage"]["emergency"],
            "upvotes": out["feedback"]["up"],
            "downvotes": out["feedback"]["down"],
            "apiErrors": (api_traffic or {}).get("errors5xx", unavailable("API Gateway metrics unavailable.")),
            "avgResponseMs": out["ai"]["avgLatencyMs"],
        }
    return out
