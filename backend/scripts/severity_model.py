"""Severity model: train, retrain from feedback, version, promote, roll back.

Run from backend/ with requirements-ml.txt installed:

  # Baseline (public dataset + synthetic labels), bundled into the image:
  python -m scripts.severity_model train --download --bundle

  # Retrain with feedback; promotes only if no metric regresses vs production:
  python -m scripts.severity_model retrain --bucket sankatai-ml-artifacts \
      --table sankatai-triage-feedback --download --promote

  python -m scripts.severity_model list     --bucket sankatai-ml-artifacts
  python -m scripts.severity_model promote  --bucket ... VERSION      # manual, still gated
  python -m scripts.severity_model rollback --bucket ... [--to VERSION]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "ml_data" / "symptom_to_diagnosis"


def _datasets(args):
    from scripts.triage_ml import dataset

    public = None
    if args.public_data:
        public = Path(args.public_data)
    elif args.download:
        public = dataset.download_public(DEFAULT_DATA)
    elif (DEFAULT_DATA / "train.jsonl").exists():
        public = DEFAULT_DATA
    if public is None:
        print("! No public dataset (use --download or --public-data DIR); training on synthetic data only.", file=sys.stderr)
    return dataset.build_dataset(public, seed=args.seed), dataset.safety_examples()


def _evaluation(model, test, safety, feedback_test=None) -> dict:
    from scripts.triage_ml.train import evaluate

    out = {"test": evaluate(model, test), "safety": evaluate(model, safety)}
    if feedback_test:
        out["feedback"] = evaluate(model, feedback_test)
    return out


def _fit(rows, safety, args):
    from app.ml.severity_model import SeverityModel
    from scripts.triage_ml.train import fit, split_groups

    train, val, test = split_groups(rows, args.seed)
    artifact = fit(train, val, seed=args.seed, c=args.C)
    model = SeverityModel(artifact)
    fb_test = [r for r in test if r.source == "feedback"]
    base_test = [r for r in test if r.source != "feedback"]
    evaluation = _evaluation(model, base_test, safety, fb_test)
    artifact["metrics"] = evaluation
    return artifact, model, (base_test, fb_test)


def cmd_train(args) -> int:
    from scripts.triage_ml.registry import encode

    rows, safety = _datasets(args)
    artifact, _, _ = _fit(rows, safety, args)
    out = Path(args.out) if args.out else ROOT / "ml_data" / f"severity-{artifact['version']}.json"
    if args.bundle:
        from app.ml.severity_model import BUNDLED_PATH
        out = BUNDLED_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(encode(artifact))
    print(json.dumps({"version": artifact["version"], "out": str(out), "metrics": artifact["metrics"],
                      "training": artifact["training"]}, indent=1))
    from scripts.triage_ml.train import gate
    ok, problems = gate(artifact["metrics"], None)
    if not ok:
        print("! Safety gate failed: " + "; ".join(problems), file=sys.stderr)
        return 1
    return 0


def _clients(args):
    import boto3

    return boto3.client("s3", region_name=args.region), boto3.resource("dynamodb", region_name=args.region).Table(args.table) if getattr(args, "table", None) else None


def cmd_retrain(args) -> int:
    from scripts.triage_ml import feedback_data, registry
    from scripts.triage_ml.train import gate

    s3, table = _clients(args)
    rows, safety = _datasets(args)
    items = feedback_data.read_items(table, feedback_data.months_back(args.months)) if table is not None else []
    fb_rows = feedback_data.to_examples(items)
    print(f"feedback rows: {len(items)} read, {len(fb_rows)} usable as labels")
    artifact, _, (base_test, fb_test) = _fit(rows + fb_rows, safety, args)
    candidate = artifact["metrics"]

    current_version = registry.current(s3, args.bucket)
    current_eval = None
    if current_version:
        cur_model, _, _ = registry.load(s3, args.bucket, current_version)
        current_eval = _evaluation(cur_model, base_test, safety, fb_test)  # same data as the candidate
    ok, problems = gate(candidate, current_eval)
    print(json.dumps({"candidate": artifact["version"], "current": current_version,
                      "candidate_metrics": candidate, "current_metrics": current_eval,
                      "promotable": ok, "problems": problems}, indent=1))
    if args.dry_run:
        return 0
    sha = registry.upload(s3, args.bucket, artifact)
    if args.promote and ok:
        registry.promote(s3, args.bucket, artifact["version"], sha, {"candidate": candidate, "current": current_eval},
                         note=f"retrain: {len(fb_rows)} feedback rows")
        print(f"promoted {artifact['version']}")
    elif args.promote:
        print("NOT promoted (gate failed); candidate kept in S3 for inspection.")
        return 2
    return 0


def cmd_promote(args) -> int:
    from scripts.triage_ml import dataset, registry
    from scripts.triage_ml.train import evaluate, gate

    s3, _ = _clients(args)
    model, artifact, sha = registry.load(s3, args.bucket, args.version)
    safety = evaluate(model, dataset.safety_examples())
    ok, problems = gate({"safety": safety, "test": artifact.get("metrics", {}).get("test", {})}, None)
    if not ok and not args.force:
        print("refused: " + "; ".join(problems))
        return 2
    registry.promote(s3, args.bucket, args.version, sha, {"safety": safety, "stored": artifact.get("metrics")}, note="manual")
    print(f"promoted {args.version}")
    return 0


def cmd_rollback(args) -> int:
    from scripts.triage_ml import registry

    s3, _ = _clients(args)
    reg = registry.rollback(s3, args.bucket, args.to)
    print(f"now serving {reg['current']}")
    return 0


def cmd_list(args) -> int:
    from app.ml.severity_model import read_registry

    s3, _ = _clients(args)
    reg = read_registry(s3, args.bucket)
    for h in reg.get("history", []):
        mark = "*" if h["version"] == reg.get("current") else " "
        test = ((h.get("evaluation") or {}).get("candidate") or {}).get("test") or {}
        print(f"{mark} {h['version']}  {h['promotedAt'][:19]}  {h.get('note', '')}  macro_f1={test.get('macro_f1')}")
    return 0


def cmd_evaluate(args) -> int:
    from app.ml.severity_model import SeverityModel
    from scripts.triage_ml.train import split_groups

    model = SeverityModel(json.loads(Path(args.model).read_text(encoding="utf-8")))
    rows, safety = _datasets(args)
    _, _, test = split_groups(rows, args.seed)
    print(json.dumps(_evaluation(model, test, safety), indent=1))
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="severity_model")
    sub = p.add_subparsers(dest="cmd", required=True)

    def data_args(sp):
        sp.add_argument("--public-data", help="dir with train.jsonl/test.jsonl (gretelai/symptom_to_diagnosis)")
        sp.add_argument("--download", action="store_true", help="fetch the public dataset into ml_data/")
        sp.add_argument("--seed", type=int, default=42)
        sp.add_argument("--C", type=float, default=4.0)

    def aws_args(sp, table=False):
        sp.add_argument("--bucket", required=True)
        sp.add_argument("--region", default="ap-south-1")
        if table:
            sp.add_argument("--table", help="triage feedback table (omit to train without feedback)")

    sp = sub.add_parser("train"); data_args(sp)
    sp.add_argument("--out"); sp.add_argument("--bundle", action="store_true", help="write app/ml/artifacts/severity_baseline.json")
    sp.set_defaults(fn=cmd_train)

    sp = sub.add_parser("retrain"); data_args(sp); aws_args(sp, table=True)
    sp.add_argument("--months", type=int, default=6); sp.add_argument("--promote", action="store_true")
    sp.add_argument("--dry-run", action="store_true")
    sp.set_defaults(fn=cmd_retrain)

    sp = sub.add_parser("promote"); aws_args(sp); sp.add_argument("version"); sp.add_argument("--force", action="store_true")
    sp.set_defaults(fn=cmd_promote)

    sp = sub.add_parser("rollback"); aws_args(sp); sp.add_argument("--to")
    sp.set_defaults(fn=cmd_rollback)

    sp = sub.add_parser("list"); aws_args(sp); sp.set_defaults(fn=cmd_list)

    sp = sub.add_parser("evaluate"); data_args(sp); sp.add_argument("--model", required=True)
    sp.set_defaults(fn=cmd_evaluate)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
