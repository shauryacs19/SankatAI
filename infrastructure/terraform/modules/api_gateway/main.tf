# HTTP API (v2) — the only public entry point to the backend.
#
#   Client ──Bearer access token──> API Gateway ──VPC Link──> internal ALB ──> private EC2
#
# The JWT authorizer validates the Cognito ACCESS token. API Gateway checks the
# `aud` claim when present and falls back to `client_id` otherwise; Cognito
# access tokens carry `client_id`, not `aud`, so listing the app client id in
# `audience` is what matches them.

resource "aws_apigatewayv2_api" "backend" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  description   = "SankatAI backend API — Cognito JWT authorizer, VPC Link to internal ALB"

  cors_configuration {
    allow_origins     = var.cors_allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["authorization", "content-type"]
    allow_credentials = false # Bearer tokens, not cookies
    max_age           = 3600
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.backend.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-cognito-jwt"

  jwt_configuration {
    audience = [var.cognito_user_pool_client_id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}

# ── VPC Link ────────────────────────────────────────────────────────────────
# Places ENIs in the private subnets so API Gateway can reach the internal ALB
# without either being exposed to the internet. No hourly charge for HTTP API
# VPC Links (unlike REST API v1 links).
resource "aws_apigatewayv2_vpc_link" "backend" {
  name               = "${var.project_name}-vpc-link"
  subnet_ids         = var.vpc_link_subnet_ids
  security_group_ids = var.vpc_link_security_group_ids

  tags = {
    Name    = "${var.project_name}-vpc-link"
    Project = var.project_name
  }
}

resource "aws_apigatewayv2_integration" "backend" {
  api_id             = aws_apigatewayv2_api.backend.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = var.alb_listener_arn
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.backend.id

  payload_format_version = "1.0"

  # Project the authorizer's verified claims onto a request header.
  #
  # `overwrite:` is what makes this safe — it REPLACES any client-supplied
  # x-user-id rather than appending, so a caller cannot inject an identity.
  # Combined with the network isolation (EC2 and ALB are unreachable except
  # through this integration), the backend can treat the header as trusted.
  #
  # There is no x-user-email: Cognito ACCESS tokens do not carry an `email`
  # claim (that is ID-token-only). The backend records email as null.
  request_parameters = {
    "overwrite:path"             = "$request.path"
    "overwrite:header.x-user-id" = "$context.authorizer.claims.sub"
  }
}

# Every application route requires a valid Cognito JWT.
resource "aws_apigatewayv2_route" "proxy" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "ANY /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.backend.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# Liveness probe only. Returns {"ok": true, "status": "..."} — no AWS details,
# no user data. /api/health/readiness is NOT exempted: it reports which backing
# services are reachable, which is reconnaissance, so it stays behind auth via
# the catch-all route above.
resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "GET /api/health"
  target             = "integrations/${aws_apigatewayv2_integration.backend.id}"
  authorization_type = "NONE"
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.project_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true

  # Deliberately excluded from this format: $context.authorizer.claims (would
  # log token contents), request/response bodies (medical data), and the
  # Authorization header. Only the opaque Cognito `sub` is recorded.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      userSub        = "$context.authorizer.claims.sub"
      authError      = "$context.authorizer.error"
      integrationErr = "$context.integrationErrorMessage"
    })
  }

  default_route_settings {
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}
