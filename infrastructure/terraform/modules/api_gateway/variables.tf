variable "project_name" {
  description = "Resource name prefix"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool that issues the access tokens the authorizer validates"
  type        = string
}

variable "cognito_user_pool_client_id" {
  description = "App client id — matched against the access token's `client_id` claim"
  type        = string
}

variable "vpc_link_subnet_ids" {
  description = "Private subnets for the VPC Link ENIs (same subnets as the internal ALB)"
  type        = list(string)
}

variable "vpc_link_security_group_ids" {
  description = "SGs applied to the VPC Link ENIs"
  type        = list(string)
}

variable "alb_listener_arn" {
  description = "Internal ALB listener the VPC Link integration forwards to"
  type        = string
}

variable "cors_allowed_origins" {
  description = "Origins allowed by the API Gateway CORS configuration"
  type        = list(string)
  default     = ["*"]
}

variable "log_retention_days" {
  description = "CloudWatch retention for access logs"
  type        = number
  default     = 14
}
