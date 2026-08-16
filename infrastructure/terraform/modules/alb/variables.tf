variable "project_name" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  description = "Private subnets (>= 2 AZs) the internal ALB places its ENIs in."
  type        = list(string)
}

variable "vpc_cidr" {
  description = "Source range allowed to reach the ALB. The VPC Link ENIs live inside the VPC, so this keeps the ALB unreachable from the internet."
  type        = string
}

variable "backend_instance_id" {
  type = string
}

variable "backend_port" {
  description = "Port FastAPI listens on inside the container's host mapping"
  type        = number
  default     = 8000
}

variable "health_check_path" {
  type    = string
  default = "/api/health"
}
