"""scripts/severity_model.py: train, retrain from feedback (gated), promote, rollback, list, evaluate."""

from __future__ import annotations

import io
import json
from decimal import Decimal

import pytest

pytest.importorskip("sklearn")

from app.ml import severity_model  # noqa: E402
from app.ml.severity_model import SeverityModel  # noqa: E402
from scripts import severity_model as cli  # noqa: E402
from scripts.triage_ml import dataset, registry, train  # noqa: E402
from scripts.triage_ml.feedback_data import months_back  # noqa: E402

BUCKET, TABLE = "ml-cli-test", "feedback-cli-test"
PUBLIC = [
    {"output_text": "common cold", "input_text": "I have a runny nose and I keep sneezing."},
    {"output_text": "pneumonia", "input_text": "High fever, cough with phlegm and it is hard to breathe."},
    {"output_text": "migraine", "input_text": "Throbbing headache on one side with nausea."},
]


@pytest.fixture(autouse=True)
def small(monkeypatch, tmp_path):
    """A small, fast dataset; never the developer's downloaded copy."""
    real = dataset.build_dataset
    monkeypatch.setattr(dataset, "build_dataset", lambda public, seed=42: real(public, seed=seed, per_public=2, per_template=3))
    monkeypatch.setattr(cli, "DEFAULT_DATA", tmp_path / "not-downloaded")


@pytest.fixture
def public_dir(tmp_path):
    d = tmp_path / "public"
    d.mkdir()
    for split in ("train", "test"):
        (d / f"{split}.jsonl").write_text("\n".join(json.dumps(r) for r in PUBLIC) + "\n\n", encoding="utf-8")
    return d


@pytest.fixture
def aws(monkeypatch):
    from moto import mock_aws

    with mock_aws():
        import boto3

        s3 = boto3.client("s3", region_name="ap-south-1")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "ap-south-1"})
        table = boto3.resource("dynamodb", region_name="ap-south-1").create_table(
            TableName=TABLE, BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}],
        )
        month = months_back(1)[0]
        for i, extra in enumerate([{"feedback": "yes"}, {"feedback": "no", "reason": "wrong_severity", "direction": "higher"},
                                   {"feedback": "no", "reason": "too_generic"}]):
            table.put_item(Item={"pk": f"FB#{month}", "sk": f"{month}-01T00:00:0{i}#r{i}", "mode": "final",
                                 "final_severity": "MODERATE", "query": "fever and cough for 3 days",
                                 "features": {"ageBand": "adult", "fever": 1, "temp_c": Decimal("38.6")}, **extra})
        yield s3


def run(*argv) -> int:
    return cli.main([str(a) for a in argv])


def test_public_data_is_loaded_and_downloaded(public_dir, tmp_path, monkeypatch):
    rows = dataset.load_public(public_dir, "train")
    assert rows == [(r["input_text"], dataset.DIAGNOSIS_BASE[r["output_text"]]) for r in PUBLIC]

    def fake_urlopen(url, timeout):
        assert url.startswith("https://huggingface.co/") and timeout == 60
        return io.BytesIO(b'{"output_text": "allergy", "input_text": "itchy eyes"}\n')
    monkeypatch.setattr(dataset.urllib.request, "urlopen", fake_urlopen)
    target = dataset.download_public(tmp_path / "dl")
    assert dataset.load_public(target, "test") == [("itchy eyes", dataset.LOW)]


def test_train_writes_a_safe_artifact(public_dir, tmp_path, capsys):
    out = tmp_path / "model.json"
    assert run("train", "--public-data", public_dir, "--out", out) == 0
    artifact = json.loads(out.read_text(encoding="utf-8"))
    report = json.loads(capsys.readouterr().out)
    assert report["version"] == artifact["version"] == SeverityModel(artifact).version
    assert artifact["metrics"]["safety"]["emergency_recall"] == 1
    assert artifact["training"]["sources"]["public"] > 0


def test_train_bundle_replaces_the_baseline(tmp_path, monkeypatch):
    target = tmp_path / "bundled.json"
    monkeypatch.setattr(severity_model, "BUNDLED_PATH", target)
    assert run("train", "--bundle") == 0  # no public data: synthetic only, with a warning
    assert SeverityModel(json.loads(target.read_text(encoding="utf-8"))).version


def test_evaluate_reports_test_and_safety_metrics(capsys):
    assert run("evaluate", "--model", severity_model.BUNDLED_PATH) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["safety"]["emergency_recall"] == 1 and report["test"]["n"] > 0


def test_retrain_uses_feedback_and_promotes_only_through_the_gate(aws, capsys, monkeypatch):
    base = ("retrain", "--bucket", BUCKET, "--table", TABLE)
    assert run(*base, "--dry-run") == 0
    out = capsys.readouterr().out
    assert "feedback rows: 3 read, 2 usable as labels" in out  # "too generic" says nothing about severity
    assert registry.current(aws, BUCKET) is None  # dry run: nothing stored

    assert run(*base, "--promote") == 0
    first = registry.current(aws, BUCKET)
    assert first and severity_model.read_registry(aws, BUCKET)["history"][-1]["note"].startswith("retrain")

    real_gate = train.gate
    monkeypatch.setattr(train, "gate", lambda candidate, current: (False, ["macro_f1 regressed"]))
    assert run(*base, "--promote") == 2
    assert registry.current(aws, BUCKET) == first  # a failed gate never changes what is served

    monkeypatch.setattr(train, "gate", real_gate)
    assert run(*base) == 0  # no --promote: candidate stored, not served
    assert registry.current(aws, BUCKET) == first


def test_promote_rollback_and_list(aws, capsys, monkeypatch):
    art = json.loads(severity_model.BUNDLED_PATH.read_text(encoding="utf-8"))
    for v in ("v-one", "v-two"):
        registry.upload(aws, BUCKET, {**art, "version": v})
    args = ("--bucket", BUCKET)
    assert run("promote", *args, "v-one") == 0
    assert run("promote", *args, "v-two") == 0
    assert run("rollback", *args) == 0
    assert registry.current(aws, BUCKET) == "v-one"
    assert run("rollback", *args, "--to", "v-two") == 0
    capsys.readouterr()
    assert run("list", *args) == 0
    listing = capsys.readouterr().out
    assert "* v-two" in listing and "  v-one" in listing

    monkeypatch.setattr(train, "gate", lambda candidate, current: (False, ["a red-flag safety case did not end as EMERGENCY"]))
    registry.upload(aws, BUCKET, {**art, "version": "v-unsafe"})
    assert run("promote", *args, "v-unsafe") == 2
    assert registry.current(aws, BUCKET) == "v-two"
    assert run("promote", *args, "v-unsafe", "--force") == 0
    assert registry.current(aws, BUCKET) == "v-unsafe"
