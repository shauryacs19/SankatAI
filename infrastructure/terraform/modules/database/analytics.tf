# Platform analytics (backend/app/repositories/analytics_repository.py).
# No Kinesis/Timestream/OpenSearch: events + counters in on-demand DynamoDB.

# Raw pseudonymised events (allow-listed metadata only). Kept for
# ANALYTICS_EVENT_TTL_DAYS (default 90) via `ttl`; the dashboard never reads it.
resource "aws_dynamodb_table" "analytics_events" {
  name         = "${var.project_name}-analytics-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "event_id"

  attribute {
    name = "event_id"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-analytics-events"
    Project = var.project_name
  }
}

# Aggregates the dashboard reads: METRIC#<name> x <day>|TOTAL counters (atomic
# ADD), hourly counters and 5-minute distinct-user sets (both expire via
# `ttl`), per-day distinct sets, first-seen markers and META rows.
resource "aws_dynamodb_table" "analytics_daily_agg" {
  name         = "${var.project_name}-analytics-daily-agg"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-analytics-daily-agg"
    Project = var.project_name
  }
}
