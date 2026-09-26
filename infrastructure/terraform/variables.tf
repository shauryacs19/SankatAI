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

variable "enable_ssm_vpc_endpoints" {
  description = "Fallback for SSM connectivity if the NAT path fails. Adds ~$43/mo across two AZs, so it stays off by default."
  type        = bool
  default     = false
}

variable "nat_instance_type" {
  description = "NAT instance size. t4g.nano is ~$4/mo vs ~$32/mo for a NAT Gateway."
  type        = string
  default     = "t4g.nano"
}

variable "terraform_state_bucket" {
  description = "S3 bucket holding this configuration's state. Must match backend.tf."
  type        = string
  default     = "admin-terraform-state-bucket-020"
}

variable "terraform_state_key" {
  description = "State object key. Must match backend.tf."
  type        = string
  default     = "sankatai/terraform.tfstate"
}

variable "terraform_state_kms_key_arn" {
  description = "KMS key ARN if the state bucket uses SSE-KMS. Leave empty for SSE-S3. Find it with: aws s3api get-bucket-encryption --bucket <state bucket>"
  type        = string
  default     = ""
}

variable "github_repository" {
  description = "owner/repo permitted to assume the CI deploy role via OIDC."
  type        = string
  default     = "shauryacs19/SankatAI"
}

variable "github_owner_id" {
  description = "Numeric GitHub owner id for the immutable OIDC subject (gh api repos/<owner>/<repo> --jq .owner.id). Empty = wildcard."
  type        = string
  default     = "278652476"
}

variable "github_repository_id" {
  description = "Numeric GitHub repository id for the immutable OIDC subject (gh api repos/<owner>/<repo> --jq .id). Empty = wildcard."
  type        = string
  default     = "1333655014"
}

variable "create_github_oidc_provider" {
  description = "Set false if this AWS account already has a GitHub OIDC provider."
  type        = bool
  default     = true
}
variable "ses_sender_email" {
  description = "Verified SES From address for admin invitation emails. Empty disables invitations (the API answers 503)."
  type        = string
  default     = ""
}

variable "app_url" {
  description = "Public web origin used in invitation links. Empty = the CloudFront domain."
  type        = string
  default     = ""
}

