# Triage ML: severity-model artifacts (versioned S3), the anonymised feedback
# store (DynamoDB), and the role the scheduled retraining job assumes.
# All pay-per-use: a few KB of JSON in S3 and on-demand DynamoDB. No SageMaker,
# no GPU, no always-on compute; inference runs on the existing backend instance.

# ── Model artifacts ──────────────────────────────────────────────────────────
# severity/models/<version>/model.json (immutable) + severity/registry.json
# (current version + promotion history). Versioning is a second safety net
# under the registry's own rollback.
# Access logging is deliberately off (reviewed): only two IAM roles can touch
# this bucket (backend: read severity/*, retrain: read/write severity/*), and
# object versioning + the registry's promotion history already record every
# change. A log bucket would add cost and a second bucket to secure for no new
# signal. The other project buckets follow the same decision.
resource "aws_s3_bucket" "ml_artifacts" { # NOSONAR(terraform:S6258) reviewed, see above
  bucket = "${var.project_name}-ml-artifacts"

  tags = {
    Name    = "${var.project_name}-ml-artifacts"
    Project = var.project_name
  }
}

resource "aws_s3_bucket_public_access_block" "ml_artifacts" {
  bucket = aws_s3_bucket.ml_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ml_artifacts" {
  bucket = aws_s3_bucket.ml_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# TLS only: any request over plain HTTP is denied, whoever makes it.
resource "aws_s3_bucket_policy" "ml_artifacts" {
  bucket     = aws_s3_bucket.ml_artifacts.id
  depends_on = [aws_s3_bucket_public_access_block.ml_artifacts]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.ml_artifacts.arn, "${aws_s3_bucket.ml_artifacts.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_s3_bucket_versioning" "ml_artifacts" {
  bucket = aws_s3_bucket.ml_artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Overwritten registry versions are only needed for a short audit window.
resource "aws_s3_bucket_lifecycle_configuration" "ml_artifacts" {
  bucket     = aws_s3_bucket.ml_artifacts.id
  depends_on = [aws_s3_bucket_versioning.ml_artifacts]

  rule {
    id     = "noncurrent-versions"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# ── Feedback store ───────────────────────────────────────────────────────────
# pk = FB#<YYYY-MM> / sk = <reply time>#<message ref>: one anonymised row per
# rated reply (no user id; keyed-hash session id; PII-scrubbed text).
# pk = BANDIT / sk = <arm>: Yes/No counters for prompt variants and questions.
resource "aws_dynamodb_table" "triage_feedback" {
  name         = "${var.project_name}-triage-feedback"
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
    Name    = "${var.project_name}-triage-feedback"
    Project = var.project_name
  }
}

# ── Scheduled retraining (GitHub Actions OIDC, main branch only) ─────────────
# Reads feedback (Query only), writes candidate models + the registry. No
# access to chat history, users, documents or the backend.
resource "aws_iam_role" "model_retrain" {
  name               = "${var.project_name}-model-retrain"
  assume_role_policy = var.github_assume_role_policy_json

  tags = {
    Project = var.project_name
  }
}

resource "aws_iam_role_policy" "model_retrain" {
  name = "${var.project_name}-model-retrain-policy"
  role = aws_iam_role.model_retrain.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = aws_dynamodb_table.triage_feedback.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.ml_artifacts.arn}/severity/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.ml_artifacts.arn
      },
    ]
  })
}
