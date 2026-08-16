resource "aws_s3_bucket" "chat_uploads" {
  bucket = "${var.project_name}-${var.chat_bucket}"

  tags = {
    Name = "${var.project_name}-${var.chat_bucket}"
  }
}

resource "aws_s3_bucket_public_access_block" "chat_uploads" {
  bucket = aws_s3_bucket.chat_uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "chat_uploads" {
  bucket = aws_s3_bucket.chat_uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# CORS — the browser uploads directly via presigned PUT and loads images via
# presigned GET, so those origins must be allowed.
resource "aws_s3_bucket_cors_configuration" "chat_uploads" {
  bucket = aws_s3_bucket.chat_uploads.id

  cors_rule {
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "chat_uploads" {
  bucket = aws_s3_bucket.chat_uploads.id

  rule {
    id     = "chat-uploads-cleanup"
    status = "Enabled"

    filter {
      prefix = ""
    }

    expiration {
      days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}