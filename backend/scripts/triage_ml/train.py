"""Fit, calibrate, export and evaluate the severity model.

Fit: scikit-learn TF-IDF (the app's own analyzer) + structured features ->
multinomial LogisticRegression (class-balanced), then a temperature fitted on
the validation split. Export: plain JSON for ``app.ml.severity_model``, checked
for parity against scikit-learn before it is returned.

Evaluate: always through the RUNTIME scorer + red-flag rules, so a candidate
and the current production model are compared on exactly what users get.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Iterable, Optional

from app.ml import red_flags
from app.ml.features import SEVERITIES, STRUCT_FEATURES, FEATURE_SCHEMA, struct_vector
from app.ml.severity_model import FORMAT, SeverityModel, analyze
from scripts.triage_ml.dataset import Example

ROUND = 6

# Case mix the model should assume when the text says little. The synthetic set
# over-represents HIGH/EMERGENCY (every red flag has templates), and "balanced"
# class weights would assume a uniform prior: both push vague openers ("I have a
# headache") toward HIGH, which is the "always see a doctor" failure. Emergencies
# do not depend on this prior: the red-flag rules guarantee them.
TARGET_PRIOR = {"LOW": 0.40, "MODERATE": 0.33, "HIGH": 0.19, "EMERGENCY": 0.08}


def split_groups(rows: list[Example], seed: int, val: float = 0.15, test: float = 0.15):
    """Split by group so augmentations of one complaint never straddle splits.
    Feedback rows are split by time instead: the newest go to test."""
    import numpy as np

    # A reproducible shuffle for the data split (not security-sensitive).
    ordered = sorted({r.group for r in rows if r.source != "feedback"})
    groups = [ordered[i] for i in np.random.default_rng(seed).permutation(len(ordered))]
    n = len(groups)
    test_g = set(groups[: int(n * test)])
    val_g = set(groups[int(n * test): int(n * (test + val))])
    tr, va, te = [], [], []
    for r in rows:
        if r.source == "feedback":
            continue
        (te if r.group in test_g else va if r.group in val_g else tr).append(r)
    fb = sorted((r for r in rows if r.source == "feedback"), key=lambda r: r.group)
    cut = int(len(fb) * 0.8)
    tr += fb[:cut]
    te += fb[cut:]
    return tr, va, te


def _matrix(vec, rows: list[Example]):
    import numpy as np
    from scipy.sparse import csr_matrix, hstack

    feats = [r.build() for r in rows]
    xt = vec.transform([f.text for f in feats])
    xs = csr_matrix(np.array([[struct_vector(f)[k] for k in STRUCT_FEATURES] for f in feats], dtype=float))
    return hstack([xt, xs]).tocsr()


def _fit_temperature(clf, x, y) -> float:
    import numpy as np

    logits = clf.decision_function(x)
    idx = np.array([SEVERITIES.index(v) for v in y])
    best_t, best_nll = 1.0, float("inf")
    for t in np.arange(0.4, 3.01, 0.05):
        z = logits / t
        z = z - z.max(axis=1, keepdims=True)
        logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))
        nll = -logp[np.arange(len(idx)), idx].mean()
        if nll < best_nll:
            best_t, best_nll = float(t), float(nll)
    return round(best_t, 3)


def fit(train: list[Example], val: list[Example], *, seed: int = 42, c: float = 4.0, max_features: int = 6000) -> dict:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    texts = [r.build().text for r in train]
    vec = TfidfVectorizer(analyzer=analyze, sublinear_tf=True, min_df=2, max_features=max_features, norm="l2")
    vec.fit(texts)
    x = _matrix(vec, train)
    y = [r.label for r in train]
    freq = Counter(y)
    prior_w = {s: TARGET_PRIOR[s] * len(y) / freq[s] for s in freq}
    clf = LogisticRegression(C=c, max_iter=4000, random_state=seed)
    clf.fit(x, y, sample_weight=[r.weight * prior_w[r.label] for r in train])
    order = [list(clf.classes_).index(s) for s in SEVERITIES]
    temperature = _fit_temperature(clf, _matrix(vec, val), [r.label for r in val]) if val else 1.0

    vocab = {term: int(i) for term, i in vec.vocabulary_.items()}
    artifact = {
        "format": FORMAT,
        "version": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "classes": list(SEVERITIES),
        "feature_schema": FEATURE_SCHEMA,
        "vocabulary": vocab,
        "idf": [round(float(v), ROUND) for v in vec.idf_],
        "struct_features": list(STRUCT_FEATURES),
        "coef": [[round(float(v), ROUND) for v in clf.coef_[k]] for k in order],
        "intercept": [round(float(clf.intercept_[k]), ROUND) for k in order],
        "temperature": temperature,
        "training": {
            "rows": len(train), "seed": seed, "C": c, "target_prior": TARGET_PRIOR,
            "sources": dict(Counter(r.source for r in train)),
            "labels": dict(Counter(y)),
        },
    }
    artifact["version"] += "-" + hashlib.sha256(json.dumps(artifact["coef"][0][:50]).encode()).hexdigest()[:6]
    _check_parity(artifact, vec, clf, order, temperature, (val or train)[:300])
    return artifact


def _check_parity(artifact: dict, vec, clf, order, temperature: float, rows: list[Example]) -> None:
    """The JSON scorer must reproduce scikit-learn (up to coefficient rounding)."""
    import numpy as np

    model = SeverityModel(artifact)
    x = _matrix(vec, rows)
    z = clf.decision_function(x)[:, order] / temperature
    z = z - z.max(axis=1, keepdims=True)
    ref = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
    worst = 0.0
    for i, r in enumerate(rows):
        f = r.build()
        p = model.proba_from(model.text_logits(f.text), struct_vector(f))
        worst = max(worst, max(abs(a - b) for a, b in zip(p, ref[i])))
    if worst > 1e-3:
        raise AssertionError(f"runtime scorer drifted from scikit-learn (max |dp| = {worst:.2e})")
    artifact.setdefault("training", {})["parity_max_abs_diff"] = float(f"{worst:.2e}")


def evaluate(model: SeverityModel, rows: Iterable[Example]) -> dict:
    """Metrics of model + red-flag rules (what users get) and of the model alone."""
    rows = list(rows)
    if not rows:
        return {}
    cm = defaultdict(int)
    under = over = correct = model_emr_hits = 0
    nll = 0.0
    per_true = Counter()
    hits = Counter()
    emr_true = emr_hit = high_true = high_hit = 0
    for r in rows:
        f = r.build()
        pred = model.predict(f)
        final, _, _ = red_flags.apply_floor(pred.severity, f)
        t, p = SEVERITIES.index(r.label), SEVERITIES.index(final)
        cm[(r.label, final)] += 1
        per_true[r.label] += 1
        nll -= math.log(max(pred.probs[r.label], 1e-9))
        if p == t:
            correct += 1
            hits[r.label] += 1
        elif p < t:
            under += 1
        else:
            over += 1
        if t == 3:
            emr_true += 1
            emr_hit += p == 3
            model_emr_hits += pred.severity == "EMERGENCY"
        if t >= 2:
            high_true += 1
            high_hit += p >= 2
    recall = {s: round(hits[s] / per_true[s], 4) if per_true[s] else None for s in SEVERITIES}
    present = [v for v in recall.values() if v is not None]
    # macro-F1 from the confusion counts
    f1s = []
    for s in SEVERITIES:
        tp = cm[(s, s)]
        fp = sum(cm[(o, s)] for o in SEVERITIES if o != s)
        fn = sum(cm[(s, o)] for o in SEVERITIES if o != s)
        if tp + fp + fn:
            f1s.append(2 * tp / (2 * tp + fp + fn))
    n = len(rows)
    return {
        "n": n,
        "accuracy": round(correct / n, 4),
        "macro_f1": round(sum(f1s) / len(f1s), 4) if f1s else None,
        "balanced_accuracy": round(sum(present) / len(present), 4) if present else None,
        "recall": recall,
        "under_triage_rate": round(under / n, 4),
        "over_triage_rate": round(over / n, 4),
        "emergency_recall": round(emr_hit / emr_true, 4) if emr_true else None,
        "emergency_recall_model_only": round(model_emr_hits / emr_true, 4) if emr_true else None,
        "high_plus_recall": round(high_hit / high_true, 4) if high_true else None,
        "nll": round(nll / n, 4),
    }


# Promotion gates: a candidate must not regress against production.
TOLERANCE = 0.01


def gate(candidate: dict, current: Optional[dict]) -> tuple[bool, list[str]]:
    """``candidate``/``current`` = {"test": metrics, "safety": metrics, "feedback": metrics?}."""
    problems = []
    if (candidate["safety"].get("emergency_recall") or 0) < 1:
        problems.append("a red-flag safety case did not end as EMERGENCY")
    if current:
        c, p = candidate["test"], current["test"]
        if c["macro_f1"] < p["macro_f1"] - TOLERANCE:
            problems.append(f"macro_f1 {c['macro_f1']} < current {p['macro_f1']}")
        if c["under_triage_rate"] > p["under_triage_rate"] + TOLERANCE:
            problems.append(f"under_triage_rate {c['under_triage_rate']} > current {p['under_triage_rate']}")
        if (c.get("high_plus_recall") or 0) < (p.get("high_plus_recall") or 0) - TOLERANCE:
            problems.append(f"high_plus_recall {c['high_plus_recall']} < current {p['high_plus_recall']}")
        cf, pf = candidate.get("feedback") or {}, current.get("feedback") or {}
        if cf.get("n", 0) >= 30 and pf.get("accuracy") is not None and cf["accuracy"] < pf["accuracy"] - TOLERANCE:
            problems.append(f"feedback accuracy {cf['accuracy']} < current {pf['accuracy']}")
    return not problems, problems
