resource "aws_cognito_user_pool" "sankatai" {
  name = "${var.project_name}-user-pool"

  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  username_attributes = ["email"]

  # Forgot-password codes go to the verified email only (in-place update).
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    mutable             = true
    required            = true
  }

  tags = {
    Name = "${var.project_name}-user-pool"
  }
}

resource "aws_cognito_user_pool_client" "sankatai" {
  name         = "${var.project_name}-app-client"
  user_pool_id = aws_cognito_user_pool.sankatai.id

  # The web app signs in with SRP only (the password never leaves the
  # browser). ALLOW_USER_PASSWORD_AUTH stays ONLY because this client is shared
  # with the mobile app, whose sign-in prefers it (JS SRP is slow on Hermes)
  # and whose change-password requires it (apps/mobile/src/lib/cognito.js).
  # Remove it once mobile moves to SRP or gets its own app client.
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # ── Hosted UI: authorization code flow ────────────────────────────────────
  # Kept configured but NOT used by the web app any more: sign-in is the
  # in-app SRP form. No Google/federated IdP exists, so nothing redirects here.
  # `code` only — the implicit flow is deliberately not enabled, as it returns
  # tokens in the URL fragment where they leak into history and referrers.
  #
  # PKCE is not a Terraform setting: a public client (generate_secret = false)
  # using the code flow REQUIRES the code_challenge/code_verifier pair, and
  # Cognito rejects a code exchange without it. The client implements S256.
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # No client secret: this client runs in a browser and on a mobile device,
  # where a secret cannot be kept. PKCE is the substitute.
  generate_secret = false

  # Lets the SPA silently restore a session on reload without a full redirect.
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "sankatai" {
  domain       = "${var.project_name}-auth"
  user_pool_id = aws_cognito_user_pool.sankatai.id
}

# Admin RBAC. Membership is managed only by the backend (invitation accept /
# admin removal) and by scripts/bootstrap_admin.py — never by Terraform, so
# no user identifiers live in code or state. Access tokens carry the group in
# `cognito:groups`; the backend also requires an active row in the admins table.
resource "aws_cognito_user_group" "admin" {
  name         = "ADMIN"
  user_pool_id = aws_cognito_user_pool.sankatai.id
  description  = "Sankat.AI administrators (admin console)."
}
