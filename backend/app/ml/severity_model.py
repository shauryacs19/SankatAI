"""Severity classifier: pure-Python scoring of a JSON artifact.

The model is TF-IDF (word 1-2 grams, sublinear tf, l2) over the conversation
text, concatenated with the structured features, into a multinomial logistic
regression with temperature scaling. It is trained with scikit-learn
(``scripts/triage_ml``) and exported as plain JSON, so the image needs neither
scikit-learn nor scipy (the backend runs on a 1 GB t3.micro), and loading a
model from S3 never unpickles anything.

Loading: ``s3://ML_ARTIFACTS_BUCKET/severity/registry.json`` names the current
version; its ``model.json`` is fetched, checked against the registry's sha256,
and swapped in. The registry is re-read every SEVERITY_MODEL_REFRESH_SECONDS,
so a promotion or rollback takes effect without a deploy. Any S3 failure keeps
the model in memory; with none loaded, the bundled baseline is used.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import threading
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core import config
from app.ml.features import SEVERITIES, Features, normalize, struct_vector, tokenize

logger = logging.getLogger("sankatai")

FORMAT = "sankatai-severity/v1"
REGISTRY_KEY = "severity/registry.json"
BUNDLED_PATH = Path(__file__).parent / "artifacts" / "severity_baseline.json"


def model_key(version: str) -> str:
    return f"severity/models/{version}/model.json"


def analyze(text: str) -> list[str]:
    """Analyzer shared with training: unigrams + bigrams of the token stream."""
    tokens = tokenize(normalize(text))
    return tokens + [f"{a} {b}" for a, b in zip(tokens, tokens[1:])]


def _softmax(z: list[float]) -> list[float]:
    m = max(z)
    e = [math.exp(v - m) for v in z]
    s = sum(e)
    return [v / s for v in e]


@dataclass(frozen=True)
class Prediction:
    probs: dict[str, float]
    severity: str
    confidence: float
    model_version: str


class SeverityModel:
    def __init__(self, artifact: dict):
        if artifact.get("format") != FORMAT:
            raise ValueError("unknown model format")
        if tuple(artifact["classes"]) != SEVERITIES:
            raise ValueError("model classes must be LOW, MODERATE, HIGH, EMERGENCY")
        self.version: str = artifact["version"]
        self.vocab: dict[str, int] = artifact["vocabulary"]
        self.idf: list[float] = artifact["idf"]
        self.struct_names: tuple[str, ...] = tuple(artifact["struct_features"])
        n_text = len(self.idf)
        coef = artifact["coef"]
        if len(coef) != len(SEVERITIES) or any(len(row) != n_text + len(self.struct_names) for row in coef):
            raise ValueError("coefficient shape does not match vocabulary + features")
        self.coef_text = [row[:n_text] for row in coef]
        self.coef_struct = [row[n_text:] for row in coef]
        self.intercept: list[float] = artifact["intercept"]
        self.temperature: float = float(artifact.get("temperature") or 1.0)
        self.metrics: dict = artifact.get("metrics") or {}

    # -- scoring --
    def tfidf(self, text: str) -> dict[int, float]:
        counts = Counter(t for t in analyze(text) if t in self.vocab)
        vec = {self.vocab[t]: (1.0 + math.log(c)) * self.idf[self.vocab[t]] for t, c in counts.items()}
        norm = math.sqrt(sum(v * v for v in vec.values()))
        return {i: v / norm for i, v in vec.items()} if norm else {}

    def text_logits(self, text: str) -> list[float]:
        vec = self.tfidf(text)
        return [sum(row[i] * v for i, v in vec.items()) for row in self.coef_text]

    def struct_logits(self, struct: dict[str, float]) -> list[float]:
        # Features the model does not know are ignored; ones it knows but the
        # extractor no longer emits count as 0. Keeps old artifacts loadable.
        values = [struct.get(name, 0.0) for name in self.struct_names]
        return [sum(w * x for w, x in zip(row, values)) for row in self.coef_struct]

    def proba_from(self, text_logits: list[float], struct: dict[str, float]) -> list[float]:
        sl = self.struct_logits(struct)
        z = [(t + s + b) / self.temperature for t, s, b in zip(text_logits, sl, self.intercept)]
        return _softmax(z)

    def predict(self, f: Features) -> Prediction:
        probs = self.proba_from(self.text_logits(f.text), struct_vector(f))
        best = max(range(len(probs)), key=probs.__getitem__)
        return Prediction(
            probs={c: round(p, 4) for c, p in zip(SEVERITIES, probs)},
            severity=SEVERITIES[best], confidence=round(probs[best], 4), model_version=self.version,
        )


# --- loading --------------------------------------------------------------

_lock = threading.Lock()
_model: Optional[SeverityModel] = None
_checked_at: Optional[float] = None  # monotonic; None = never (0.0 is a valid boot-time clock)


def _s3():
    import boto3
    from botocore.config import Config

    return boto3.client("s3", region_name=config.AWS_REGION, config=Config(
        connect_timeout=2, read_timeout=5, retries={"max_attempts": 1}))


def load_bundled() -> SeverityModel:
    return SeverityModel(json.loads(BUNDLED_PATH.read_text(encoding="utf-8")))


def read_registry(client, bucket: str) -> dict:
    try:
        body = client.get_object(Bucket=bucket, Key=REGISTRY_KEY)["Body"].read()
    except client.exceptions.NoSuchKey:
        return {}
    return json.loads(body)


def _load_from_s3(current: Optional[SeverityModel]) -> Optional[SeverityModel]:
    bucket = config.ML_ARTIFACTS_BUCKET
    client = _s3()
    registry = read_registry(client, bucket)
    version = registry.get("current")
    if not version or (current is not None and current.version == version):
        return None
    entry = next((h for h in registry.get("history", []) if h.get("version") == version), {})
    body = client.get_object(Bucket=bucket, Key=model_key(version))["Body"].read()
    if entry.get("sha256") and hashlib.sha256(body).hexdigest() != entry["sha256"]:
        raise ValueError(f"model {version} does not match the registry checksum")
    return SeverityModel(json.loads(body))


def refresh(force: bool = False) -> SeverityModel:
    """Re-read the registry if due (or forced). Never raises once a model exists."""
    global _model, _checked_at
    with _lock:
        now = time.monotonic()
        due = force or _model is None or _checked_at is None or now - _checked_at >= config.SEVERITY_MODEL_REFRESH_SECONDS
        if not due:
            return _model  # type: ignore[return-value]
        _checked_at = now
        if config.ML_ARTIFACTS_BUCKET:
            try:
                loaded = _load_from_s3(_model)
                if loaded is not None:
                    logger.info("Severity model %s loaded from S3.", loaded.version)
                    _model = loaded
            except Exception as err:  # noqa: BLE001 - keep serving the model we have
                logger.warning("Severity model refresh failed (%s); keeping %s.", type(err).__name__,
                               _model.version if _model else "bundled baseline")
        if _model is None:
            _model = load_bundled()
            logger.info("Severity model %s (bundled baseline).", _model.version)
        return _model


def get_model() -> SeverityModel:
    if _model is not None and _checked_at is not None and time.monotonic() - _checked_at < config.SEVERITY_MODEL_REFRESH_SECONDS:
        return _model
    return refresh()


def reset_for_tests(model: Optional[SeverityModel] = None) -> None:
    global _model, _checked_at
    with _lock:
        _model, _checked_at = model, (time.monotonic() if model else None)
