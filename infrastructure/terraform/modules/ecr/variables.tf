variable "project_name" {
  type = string
}

variable "github_repository" {
  description = "owner/repo allowed to assume the deploy role, e.g. shaurya/SankatAI"
  type        = string
}

variable "backend_instance_id" {
  description = "EC2 instance the deploy job targets via SSM Run Command"
  type        = string
}

variable "frontend_bucket_arn" {
  description = "S3 bucket holding the built web app. The deploy job syncs into it."
  type        = string
}

variable "cloudfront_distribution_id" {
  description = "CloudFront distribution the deploy job invalidates after a web sync."
  type        = string
}

variable "github_owner_id" {
  description = "Numeric GitHub owner id, for the immutable OIDC subject. Leave empty to wildcard it. Read with: gh api repos/<owner>/<repo> --jq .owner.id"
  type        = string
  default     = ""
}

variable "github_repository_id" {
  description = "Numeric GitHub repository id, for the immutable OIDC subject. Leave empty to wildcard it. Read with: gh api repos/<owner>/<repo> --jq .id"
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "false if the account already has a GitHub OIDC provider (IAM allows only one per URL)"
  type        = bool
  default     = true
}
