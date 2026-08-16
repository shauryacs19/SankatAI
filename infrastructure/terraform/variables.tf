variable "region" {
  description = "The AWS region to create resources in."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Prefix for all resource names."
  type        = string
  default     = "sankatai"
}

# CloudFront's /api/* origin is now module.api_gateway.api_domain_name, wired
# directly in main.tf — the EC2 host is private and has no public DNS name.

variable "backend_origin_port" {
  description = "Port FastAPI is published on inside the VPC (ALB target port)."
  type        = number
  default     = 8000
}

# Browser origins allowed to upload/download directly to S3 (presigned PUT/GET).
# Set to your CloudFront URL + local dev origin in production.
variable "cors_allowed_origins" {
  description = "Allowed browser origins for direct-to-S3 access."
  type        = list(string)
  default     = ["*"]
}


variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

# `ssh_cidr` is gone: the backend has no SSH ingress at all. Shell access is
# SSM Session Manager, which is outbound-initiated and needs no open port.

variable "nat_instance_type" {
  description = "NAT instance size. t4g.nano is ~$4/mo vs ~$32/mo for a NAT Gateway."
  type        = string
  default     = "t4g.nano"
}

variable "cognito_callback_urls" {
  description = "Hosted UI redirect URIs (exact match, including scheme and path)."
  type        = list(string)
  default = [
    "http://localhost:5173/auth/callback",
    "sankatai://auth/callback",
  ]
}

variable "cognito_logout_urls" {
  description = "Allowed post-logout redirect targets."
  type        = list(string)
  default = [
    "http://localhost:5173/",
    "sankatai://",
  ]
}

variable "github_repository" {
  description = "owner/repo permitted to assume the CI deploy role via OIDC."
  type        = string
  default     = "shauryacs19/SankatAI"
}

variable "create_github_oidc_provider" {
  description = "Set false if this AWS account already has a GitHub OIDC provider."
  type        = bool
  default     = true
}