# Invitation email (admin console). SES is the project's only mail provider.
#
# Created only when var.ses_sender_email is set. AWS then emails that address a
# verification link, and nothing can be sent until someone clicks it.
#
# ⚠ SES starts in the SANDBOX: mail is delivered only to verified addresses
# (verify each test Gmail with `aws ses verify-email-identity`). Request
# production access in the SES console (Account dashboard -> Request production
# access) before inviting arbitrary Gmail users. A sender on a domain you own
# (with DKIM) delivers far better than a gmail.com From address, which fails
# DMARC alignment when sent through SES.
resource "aws_ses_email_identity" "sender" {
  count = var.ses_sender_email == "" ? 0 : 1
  email = var.ses_sender_email
}

# Lets Cognito send sign-in codes (EMAIL_OTP) as this identity.
data "aws_caller_identity" "ses" {}

resource "aws_ses_identity_policy" "cognito" {
  count    = var.ses_sender_email == "" ? 0 : 1
  identity = aws_ses_email_identity.sender[0].arn
  name     = "${var.project_name}-cognito-send"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "email.cognito-idp.amazonaws.com" }
      Action    = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource  = aws_ses_email_identity.sender[0].arn
      Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.ses.account_id } }
    }]
  })
}
