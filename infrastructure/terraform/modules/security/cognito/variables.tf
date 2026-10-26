variable "project_name" {
  type = string
}

variable "passkey_relying_party_id" {
  description = "WebAuthn relying party ID for passkeys: the web app's domain (no scheme)."
  type        = string
}

variable "ses_sender_email" {
  description = "Verified SES sender for Cognito mail (email sign-in codes). Empty = Cognito default mailer, no EMAIL_OTP."
  type        = string
  default     = ""
}

variable "ses_identity_arn" {
  description = "ARN of the SES identity for ses_sender_email."
  type        = string
  default     = ""
}
