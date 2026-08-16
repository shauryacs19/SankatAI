data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "frontend" {
  # S3 bucket names are globally unique. Suffix with the account ID so the
  # name can't collide with buckets in other accounts (which makes the create
  # call retry until timeout and appear to "create forever").
  bucket = "${var.project_name}-frontend-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.project_name}-frontend"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.project_name} React frontend"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # Backend API origin — the API Gateway HTTP API, NOT the EC2 host (which is
  # private and has no public DNS name). Keeping /api/* behind the same
  # CloudFront domain makes browser calls same-origin, so there is no CORS
  # preflight and no VITE_API_URL to configure per environment.
  #
  # https-only: API Gateway does not serve plaintext HTTP.
  dynamic "origin" {
    for_each = var.backend_origin_domain != "" ? [1] : []
    content {
      domain_name = var.backend_origin_domain
      origin_id   = "backend-api"
      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-${aws_s3_bucket.frontend.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  # Route /api/* to API Gateway. Never cached; forwards the Authorization
  # header so the Cognito JWT authorizer can validate it.
  dynamic "ordered_cache_behavior" {
    for_each = var.backend_origin_domain != "" ? [1] : []
    content {
      path_pattern           = "/api/*"
      target_origin_id       = "backend-api"
      viewer_protocol_policy = "redirect-to-https"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true
      min_ttl                = 0
      default_ttl            = 0
      max_ttl                = 0

      forwarded_values {
        query_string = true
        headers      = ["Authorization", "Content-Type", "Accept", "Origin"]
        cookies {
          # No cookies in the auth path any more — the custom web-session
          # cookie is gone and auth is a Bearer token. Forwarding none also
          # keeps CloudFront from ever keying a cache entry on a session.
          forward = "none"
        }
      }
    }
  }

  # SPA fallback: with OAC + a private bucket, S3 returns 403 for unknown keys,
  # so mapping 403 -> index.html covers client-side routes. We deliberately do
  # NOT remap 404, so genuine API 404s from the backend pass through unchanged.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-frontend-cdn"
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}
