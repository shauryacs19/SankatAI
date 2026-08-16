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
