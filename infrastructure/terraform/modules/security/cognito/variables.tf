variable "project_name" {
  type = string
}

variable "passkey_relying_party_id" {
  description = "WebAuthn relying party ID for passkeys: the web app's domain (no scheme)."
  type        = string
}
