variable "project_name" {
  type = string
}

variable "region" {
  type = string
}

# S3 bucket ARNs (from the storage module).
variable "chat_bucket_arn" {
  description = "ARN of the transient chat-uploads bucket."
  type        = string
}

variable "file_bucket_arn" {
  description = "ARN of the permanent file-storage (vault) bucket."
  type        = string
}

# DynamoDB table ARNs (from the database module).
variable "user_profiles_table_arn" {
  type = string
}

variable "chat_history_table_arn" {
  type = string
}

variable "attachments_table_arn" {
  type = string
}

variable "ai_api_key_secret_arn" {
  description = "Secrets Manager ARN of the AI provider key. Scoped so the role cannot read other secrets."
  type        = string
}

# NOTE: the ECR repo ARN is NOT an input. The ecr module needs the EC2 instance
# id (for the SSM deploy grant), EC2 needs this module's instance profile, so
# taking the repo ARN here would close a cycle: ecr -> ec2 -> iam -> ecr.
# The ARN is constructed from project_name instead.
