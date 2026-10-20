"""Severity model: feature parsing, JSON scorer, S3 versioning, promotion gate."""

from __future__ import annotations

import hashlib
import json

import pytest

from app.core import config
from app.ml import severity_model
from app.ml.features import SEVERITIES, STRUCT_FEATURES, Turn, build_features, parse_duration, parse_vitals
from app.ml.severity_model import SeverityModel


def feats(*texts, **kw):
    return build_features([Turn("user", t) for t in texts], **kw)


# --- features --------------------------------------------------------------

@pytest.mark.parametrize("text,days", [
    ("fever for 3 days", 3), ("since yesterday", 1), ("2 hafte se khansi", 14), ("5 दिन से बुखार", 5),
    ("it started 6 hours ago", 0.25), ("for a couple of weeks", 14), ("headache", None),
])
def test_duration(text, days):
    assert parse_duration(text) == pytest.approx(days) if days is not None else parse_duration(text) is None


def test_age_band_from_text_overrides_profile_only_for_someone_else():
    assert feats("my 3 year old son has fever", profile_age=40).age_band == "child"
    assert feats("I have a fever", profile_age=40).age_band == "adult"
    assert feats("my mother has a fever", profile_age=40).age_band == "unknown"  # not the profile owner
    assert feats("baby is 2 months old").age == pytest.approx(2 / 12)


def test_vitals_and_negation():
    v = parse_vitals("temp 102 f, pulse 118, spo2 93%, bp 150/95")
    assert v["temp_c"] == pytest.approx(38.9, abs=0.1) and v["heart_rate"] == 118 and v["spo2"] == 93 and v["sbp"] == 150
    f = feats("no fever, but vomiting since morning")
    assert f.flags["fever"] == -1 and f.flags["vomiting"] == 1
    assert feats("bukhar nahi hai").flags["fever"] == -1
    assert feats("सांस फूल रही है").flags["breathing"] == 1


def test_slot_answers_are_parsed_against_the_question_asked():
    f = build_features([Turn("user", "headache"), Turn("assistant", "?", slot="fever"), Turn("user", "haan"),
                        Turn("assistant", "?", slot="pain"), Turn("user", "7")])
    assert f.flags["fever"] == 1 and f.pain_band == "severe" and f.asked == ["fever", "pain"]
    assert "haan" not in f.text  # bare answers do not pollute the text features


def test_image_findings_become_features():
    f = feats("rash on my arm", image_findings=[{"severityCue": "moderate", "bodyRegion": "forearm", "visibleSigns": ["redness", "blisters"]}])
    assert f.image_cue == "moderate" and "blisters" in f.text


# --- scorer ----------------------------------------------------------------

def test_bundled_model_loads_and_scores():
    model = severity_model.load_bundled()
    p = model.predict(feats("mild sore throat since morning"))
    assert set(p.probs) == set(SEVERITIES) and sum(p.probs.values()) == pytest.approx(1, abs=1e-3)
    assert p.severity == max(p.probs, key=p.probs.get) and p.model_version == model.version
    assert model.struct_names == STRUCT_FEATURES


def test_model_separates_mild_from_serious():
    model = severity_model.load_bundled()
    mild = model.predict(feats("runny nose and sneezing for 2 days, no fever"))
    serious = model.predict(feats("fever 104 f for 8 days, vomiting, I am 75 years old"))
    order = SEVERITIES.index
    assert order(mild.severity) <= order("MODERATE")
    assert order(serious.severity) >= order("HIGH")


def test_artifact_shape_is_validated():
    art = json.loads(severity_model.BUNDLED_PATH.read_text(encoding="utf-8"))
    bad = {**art, "coef": [row[:-1] for row in art["coef"]]}
    with pytest.raises(ValueError):
        SeverityModel(bad)
    with pytest.raises(ValueError):
        SeverityModel({**art, "format": "pickle"})


def test_runtime_scorer_matches_scikit_learn():
    pytest.importorskip("sklearn")
    from scripts.triage_ml import dataset
    from scripts.triage_ml.train import fit, split_groups

    rows = dataset.build_dataset(None, seed=7, per_template=4)
    train, val, _ = split_groups(rows, 7)
    artifact = fit(train, val, seed=7)  # raises if the JSON scorer drifts from sklearn
    assert artifact["training"]["parity_max_abs_diff"] < 1e-3
    assert SeverityModel(json.loads(json.dumps(artifact))).version == artifact["version"]


# --- S3 versioning ---------------------------------------------------------

@pytest.fixture
def bucket(monkeypatch):
    from moto import mock_aws

    with mock_aws():
        import boto3

        s3 = boto3.client("s3", region_name="ap-south-1")
        s3.create_bucket(Bucket="ml-test", CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
        monkeypatch.setattr(config, "ML_ARTIFACTS_BUCKET", "ml-test")
        severity_model.reset_for_tests()
        yield s3


def _artifact(version: str) -> dict:
    art = json.loads(severity_model.BUNDLED_PATH.read_text(encoding="utf-8"))
    return {**art, "version": version}


def test_model_is_loaded_from_the_registry_and_checksum_verified(bucket):
    from scripts.triage_ml import registry

    sha = registry.upload(bucket, "ml-test", _artifact("v-a"))
    registry.promote(bucket, "ml-test", "v-a", sha, {})
    assert severity_model.refresh(force=True).version == "v-a"

    # A tampered artifact is refused; the model in memory keeps serving.
    bucket.put_object(Bucket="ml-test", Key=severity_model.model_key("v-b"), Body=registry.encode(_artifact("v-b")))
    registry.promote(bucket, "ml-test", "v-b", hashlib.sha256(b"something else").hexdigest(), {})
    assert severity_model.refresh(force=True).version == "v-a"


def test_rollback_only_to_promoted_versions(bucket):
    from scripts.triage_ml import registry

    for v in ("v-1", "v-2"):
        registry.promote(bucket, "ml-test", v, registry.upload(bucket, "ml-test", _artifact(v)), {})
    assert registry.rollback(bucket, "ml-test")["current"] == "v-1"
    assert severity_model.refresh(force=True).version == "v-1"
    registry.upload(bucket, "ml-test", _artifact("v-unvetted"))
    with pytest.raises(SystemExit):
        registry.rollback(bucket, "ml-test", to="v-unvetted")


def test_no_bucket_or_s3_failure_falls_back_to_bundled(monkeypatch):
    monkeypatch.setattr(config, "ML_ARTIFACTS_BUCKET", "missing-bucket")
    monkeypatch.setattr(severity_model, "_load_from_s3", lambda current: (_ for _ in ()).throw(RuntimeError("down")))
    assert severity_model.refresh(force=True).version == severity_model.load_bundled().version


# --- promotion gate --------------------------------------------------------

def _m(f1=0.7, under=0.1, high=0.8):
    return {"macro_f1": f1, "under_triage_rate": under, "high_plus_recall": high}


def test_gate_blocks_regressions_and_unsafe_models():
    from scripts.triage_ml.train import gate

    safe = {"emergency_recall": 1.0}
    assert gate({"test": _m(), "safety": safe}, {"test": _m()})[0]
    assert not gate({"test": _m(f1=0.6), "safety": safe}, {"test": _m()})[0]
    assert not gate({"test": _m(under=0.2), "safety": safe}, {"test": _m()})[0]
    ok, problems = gate({"test": _m(), "safety": {"emergency_recall": 0.95}}, None)
    assert not ok and "red-flag" in problems[0]


def test_feedback_labels_never_cross_the_safety_floor():
    from scripts.triage_ml.feedback_data import label_of, to_examples

    base = {"mode": "final", "final_severity": "HIGH", "feedback": "no", "reason": "wrong_severity"}
    assert label_of({**base, "direction": "higher"}) == ("EMERGENCY", 0.5)
    assert label_of({**base, "direction": "lower"}) == ("MODERATE", 0.5)
    assert label_of({**base, "reason": "too_generic"}) is None
    assert label_of({"mode": "final", "final_severity": "LOW", "feedback": "yes"}) == ("LOW", 1.0)
    assert label_of({"mode": "ask", "feedback": "yes"}) is None
    # "lower" on a chest-pain case: the rule floor keeps it at EMERGENCY.
    rows = to_examples([{**base, "final_severity": "EMERGENCY", "direction": "lower", "query": "chest pain", "features": {}, "sk": "1"},
                        {**base, "direction": "lower", "query": "I have chest pain", "features": {}, "sk": "2"}])
    assert [r.label for r in rows] == ["EMERGENCY"]
