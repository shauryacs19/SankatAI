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
