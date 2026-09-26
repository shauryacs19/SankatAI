variable "project_name" {
  type = string
}

variable "callback_urls" {
  description = "Exact redirect URIs for the Hosted UI authorization-code flow. Cognito matches these literally — a trailing-slash mismatch fails the redirect."
  type        = list(string)
  default     = ["http://localhost:5173/auth/callback"]
}

variable "logout_urls" {
  description = "Allowed post-logout redirect targets."
  type        = list(string)
  default     = ["http://localhost:5173/"]
}

# Social sign-in credentials. Empty = that provider is not created. Set them in
# terraform.tfvars (gitignored, local only). The secrets end up in the
# (encrypted) Terraform state, like any IdP configured through Terraform.
variable "google_client_id" {
  type    = string
  default = ""
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "facebook_app_id" {
  type    = string
  default = ""
}

variable "facebook_app_secret" {
  type      = string
  default   = ""
  sensitive = true
}
