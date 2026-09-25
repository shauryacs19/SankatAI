"""API Gateway (HTTP API) metrics from CloudWatch ``AWS/ApiGateway``.

HTTP APIs publish ``Count``, ``4xx``, ``5xx`` and ``Latency`` per ``ApiId`` by
default (no detailed metrics needed). ``cloudwatch:GetMetricData`` has no
resource-level scoping, so the role's grant is ``Resource: *``; it can read
metrics only, never logs.
"""

from __future__ import annotations

from datetime import datetime

import boto3
from botocore.config import Config

from app.core import config

_client = None

# id -> (metric name, statistic)
_QUERIES = {
    "count": ("Count", "Sum"),
    "err4xx": ("4xx", "Sum"),
    "err5xx": ("5xx", "Sum"),
    "latency": ("Latency", "Average"),
}


def configured() -> bool:
    return bool(config.API_GATEWAY_ID)


def client():
    global _client
    if _client is None:
        _client = boto3.client(
            "cloudwatch",
            region_name=config.AWS_REGION,
            config=Config(connect_timeout=3, read_timeout=6, retries={"max_attempts": 2}),
        )
    return _client


def api_metrics(start: datetime, end: datetime) -> dict[str, float | None]:
    """Totals over [start, end]: request count, 4xx, 5xx, average latency (ms).

    One datapoint per metric (period = the whole window, rounded up to a
    minute). A metric with no datapoints is None, not 0: CloudWatch omits
    empty periods, so "no data" and "zero" are indistinguishable for averages.
    """
    seconds = max(60, int((end - start).total_seconds()))
    # Older data is only retained at coarser resolution (1 h after 63 days).
    step = 3600 if seconds > 86400 else 60
    period = ((seconds + step - 1) // step) * step
    resp = client().get_metric_data(
        MetricDataQueries=[
            {
                "Id": qid,
                "MetricStat": {
                    "Metric": {
                        "Namespace": "AWS/ApiGateway",
                        "MetricName": name,
                        "Dimensions": [{"Name": "ApiId", "Value": config.API_GATEWAY_ID}],
                    },
                    "Period": period,
                    "Stat": stat,
                },
                "ReturnData": True,
            }
            for qid, (name, stat) in _QUERIES.items()
        ],
        StartTime=start,
        EndTime=end,
    )
    out: dict[str, float | None] = {qid: None for qid in _QUERIES}
    for result in resp.get("MetricDataResults", []):
        values = result.get("Values") or []
        if not values:
            continue
        stat = _QUERIES[result["Id"]][1]
        out[result["Id"]] = sum(values) if stat == "Sum" else sum(values) / len(values)
    # Sums are counts; a window with traffic but no errors reports no 4xx/5xx
    # datapoints at all, which does mean zero.
    if out["count"] is not None:
        out["err4xx"] = out["err4xx"] or 0.0
        out["err5xx"] = out["err5xx"] or 0.0
    return out
