"""Model versions in S3 (the bucket is versioned too, as a second safety net).

    severity/models/<version>/model.json   immutable artifact (metrics inside)
    severity/registry.json                 {"current", "history": [...], "updatedAt"}

``history`` lists every PROMOTED version, newest last, with its sha256 and
evaluation. The backend reads ``current`` (checksum-verified) every few minutes,
so promote/rollback take effect without a deploy.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

from app.ml.severity_model import REGISTRY_KEY, SeverityModel, model_key, read_registry


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def encode(artifact: dict) -> bytes:
    return json.dumps(artifact, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def upload(client, bucket: str, artifact: dict) -> str:
    """Store a candidate (not yet serving). Returns its sha256."""
    body = encode(artifact)
    client.put_object(Bucket=bucket, Key=model_key(artifact["version"]), Body=body,
                      ContentType="application/json", ServerSideEncryption="AES256")
    return hashlib.sha256(body).hexdigest()


def load(client, bucket: str, version: str) -> tuple[SeverityModel, dict, str]:
    body = client.get_object(Bucket=bucket, Key=model_key(version))["Body"].read()
    artifact = json.loads(body)
    return SeverityModel(artifact), artifact, hashlib.sha256(body).hexdigest()


def _write(client, bucket: str, registry: dict) -> None:
    registry["updatedAt"] = _now()
    client.put_object(Bucket=bucket, Key=REGISTRY_KEY, Body=json.dumps(registry, indent=1).encode(),
                      ContentType="application/json", ServerSideEncryption="AES256")


def current(client, bucket: str) -> Optional[str]:
    return read_registry(client, bucket).get("current")


def promote(client, bucket: str, version: str, sha256: str, evaluation: dict, note: str = "") -> dict:
    registry = read_registry(client, bucket) or {"history": []}
    registry.setdefault("history", []).append({
        "version": version, "sha256": sha256, "promotedAt": _now(),
        "previous": registry.get("current"), "evaluation": evaluation, "note": note,
    })
    registry["current"] = version
    _write(client, bucket, registry)
    return registry


def rollback(client, bucket: str, to: Optional[str] = None) -> dict:
    """Serve ``to`` (a previously promoted version) or the one before current."""
    registry = read_registry(client, bucket)
    history = registry.get("history") or []
    promoted = [h["version"] for h in history]
    if to is None:
        cur = registry.get("current")
        entry = next((h for h in reversed(history) if h["version"] == cur), None)
        to = entry.get("previous") if entry else None
        if not to:
            raise SystemExit("Nothing to roll back to.")
    if to not in promoted:
        raise SystemExit(f"{to} was never promoted; refusing to serve an unvetted model.")
    src = next(h for h in reversed(history) if h["version"] == to)
    history.append({**src, "promotedAt": _now(), "previous": registry.get("current"), "note": "rollback"})
    registry["current"] = to
    _write(client, bucket, registry)
    return registry
