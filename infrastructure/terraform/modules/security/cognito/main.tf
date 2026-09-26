# Sign-in for web and mobile (one pool, one public app client).
#
# People sign in with a username, a verified email or a verified phone number
# (all Cognito aliases), with a password, a texted one-time code or a passkey.
# The Cognito `username` is an
# opaque UUID the client picks at sign-up; the person's handle is
# `preferred_username`, which Cognito keeps unique and lets them change.
#
# ── 2026-09-26: new pool ─────────────────────────────────────────────────────
# The previous pool was created with username_attributes = ["email"], which
# Cognito can never change, so phone and username sign-in needed a new pool.
# The old pool, client, domain and group are NOT destroyed: the removed blocks
# below only drop them from Terraform state. They stay in AWS, unused (the API
# authorizer and both apps point at the new pool), until someone deletes them
# from the Cognito console.
removed {
  from = aws_cognito_user_pool.sankatai
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_cognito_user_pool_client.sankatai
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_cognito_user_pool_domain.sankatai
  lifecycle {
    destroy = false
  }
}

removed {
  from = aws_cognito_user_group.admin
  lifecycle {
    destroy = false
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  sms_external_id = "${var.project_name}-cognito-sms"
  pre_sign_up     = "${var.project_name}-cognito-pre-sign-up"
}

resource "aws_cognito_user_pool" "users" {
  name = "${var.project_name}-users"

  # Essentials is required for passwordless (SMS one-time code) sign-in.
  user_pool_tier = "ESSENTIALS"

  # Replacing a pool deletes every account in it; make that an explicit step.
  deletion_protection = "ACTIVE"

  alias_attributes         = ["email", "phone_number", "preferred_username"]
  auto_verified_attributes = ["email", "phone_number"]

  username_configuration {
    case_sensitive = false
  }

  # Mirrored by the apps' password checklists (apps/web authErrors.js).
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  # First factors people may choose. EMAIL_OTP is left out: Cognito can only
  # send email codes through SES, and the SES account is still in the sandbox.
  sign_in_policy {
    allowed_first_auth_factors = ["PASSWORD", "SMS_OTP", "WEB_AUTHN"]
  }

  # Passkeys. The relying party is the website's own domain (the CloudFront
  # distribution): the browser only offers a passkey to the site whose domain
  # matches, and the apps never use Cognito's hosted pages for passkeys.
  web_authn_configuration {
    relying_party_id  = var.passkey_relying_party_id
    user_verification = "preferred"
  }

  # Passwordless sign-in needs MFA off or optional.
  mfa_configuration = "OFF"

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
    recovery_mechanism {
      name     = "verified_phone_number"
      priority = 2
    }
  }

  # SMS (sign-up verification and sign-in codes) goes through Amazon SNS as
  # the role below. While the account's SNS SMS sandbox is on, only verified
  # destination numbers receive texts; Indian numbers also need TRAI DLT
  # sender/template registration before production traffic.
  sms_configuration {
    external_id    = local.sms_external_id
    sns_caller_arn = aws_iam_role.cognito_sms.arn
    sns_region     = data.aws_region.current.region
  }
  sms_authentication_message = "Your SankatAI sign-in code is {####}"

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    sms_message          = "Your SankatAI verification code is {####}"
  }

  # One function for both triggers (it dispatches on triggerSource). Post
  # confirmation sets the chosen username: Cognito refuses preferred_username
  # on an unconfirmed account when it is an alias.
  lambda_config {
    pre_sign_up       = aws_lambda_function.pre_sign_up.arn
    post_confirmation = aws_lambda_function.pre_sign_up.arn
  }

  tags = {
    Name = "${var.project_name}-users"
  }

  # The SMS role must be assumable before Cognito validates it.
  depends_on = [aws_iam_role_policy.cognito_sms]
}

resource "aws_cognito_user_pool_client" "app" {
  name         = "${var.project_name}-app"
  user_pool_id = aws_cognito_user_pool.users.id

  # USER_AUTH: passwordless SMS codes. SRP: web password sign-in (the password
  # never leaves the browser). USER_PASSWORD_AUTH: mobile password sign-in,
  # where JS SRP is slow on Hermes, and mobile change-password.
  explicit_auth_flows = [
    "ALLOW_USER_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # No OAuth / hosted pages: every sign-in is the apps' own forms calling the
  # Cognito API. (Google/Facebook sign-in was removed on 2026-09-26.)
  allowed_oauth_flows_user_pool_client = false
  allowed_oauth_flows                  = []
  allowed_oauth_scopes                 = []
  callback_urls                        = []
  logout_urls                          = []
  supported_identity_providers         = ["COGNITO"]

  # Runs in browsers and on phones, where a secret can't be kept.
  generate_secret = false

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

# Admin RBAC. Membership is managed only by the backend (invitation accept /
# admin removal) and by scripts/bootstrap_admin.py.
resource "aws_cognito_user_group" "admins" {
  name         = "ADMIN"
  user_pool_id = aws_cognito_user_pool.users.id
  description  = "Sankat.AI administrators (admin console)."
}

# ── SMS: role Cognito assumes to publish texts through SNS ──────────────────
resource "aws_iam_role" "cognito_sms" {
  name = "${var.project_name}-cognito-sms"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cognito-idp.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = {
        StringEquals = {
          "sts:ExternalId"    = local.sms_external_id
          "aws:SourceAccount" = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}

# SMS goes straight to a phone number, which has no ARN, so "*" is the only
# possible Resource for sns:Publish here. The role can do nothing else.
resource "aws_iam_role_policy" "cognito_sms" {
  name = "${var.project_name}-cognito-sms"
  role = aws_iam_role.cognito_sms.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["sns:Publish"]
      Resource = "*"
    }]
  })
}

# ── Sign-up triggers: duplicate/username checks, then set the username ────
# Source: backend/lambdas/cognito_pre_sign_up.py (tested in backend/tests).
data "archive_file" "pre_sign_up" {
  type        = "zip"
  source_file = "${path.module}/../../../../../backend/lambdas/cognito_pre_sign_up.py"
  output_path = "${path.root}/.terraform/build/cognito-pre-sign-up.zip"
}

resource "aws_cloudwatch_log_group" "pre_sign_up" {
  name              = "/aws/lambda/${local.pre_sign_up}"
  retention_in_days = 14
}

resource "aws_iam_role" "pre_sign_up" {
  name = local.pre_sign_up

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "pre_sign_up" {
  name = local.pre_sign_up
  role = aws_iam_role.pre_sign_up.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["cognito-idp:ListUsers", "cognito-idp:AdminUpdateUserAttributes"]
        Resource = aws_cognito_user_pool.users.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.pre_sign_up.arn}:*"
      },
    ]
  })
}

resource "aws_lambda_function" "pre_sign_up" {
  function_name    = local.pre_sign_up
  description      = "Cognito pre sign-up + post confirmation: duplicate/username checks, set username"
  role             = aws_iam_role.pre_sign_up.arn
  runtime          = "python3.12"
  handler          = "cognito_pre_sign_up.handler"
  filename         = data.archive_file.pre_sign_up.output_path
  source_code_hash = data.archive_file.pre_sign_up.output_base64sha256
  timeout          = 5
  memory_size      = 128

  depends_on = [aws_cloudwatch_log_group.pre_sign_up]
}

resource "aws_lambda_permission" "cognito_pre_sign_up" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_sign_up.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.users.arn
}
