variable "project_name" {
  type = string
}

variable "point_in_time_recovery" {
  description = "PITR on the feedback table (it is the retraining dataset)."
  type        = bool
  default     = true
}

variable "github_assume_role_policy_json" {
  description = "Trust policy for GitHub Actions OIDC, scoped to this repo's main branch (from the ecr module)."
  type        = string
}
