variable "project_name" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "vpc_id" {
  type = string
}

variable "subnet_id" {
  description = "PRIVATE subnet id. The instance must not be placed in a public subnet."
  type        = string
}

variable "iam_instance_profile" {
  type = string
}

variable "alb_security_group_id" {
  description = "The only source allowed to reach the application port."
  type        = string
}

variable "app_port" {
  description = "Host port the FastAPI container is published on"
  type        = number
  default     = 8000
}

variable "ecr_repository_url" {
  description = "ECR repo the instance pulls the backend image from (informational; the deploy job does the pull)."
  type        = string
  default     = ""
}
