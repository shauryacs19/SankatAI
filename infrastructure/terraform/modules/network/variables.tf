variable "project_name" {
  type = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  description = "First public subnet (AZ a). Holds the NAT instance and one ALB ENI."
  type        = string
  default     = "10.0.1.0/24"
}

variable "public_subnet_b_cidr" {
  description = "Second public subnet — an ALB requires subnets in two AZs."
  type        = string
  default     = "10.0.2.0/24"
}

variable "private_subnet_cidrs" {
  description = "Private subnets (AZ a, AZ b). EC2 and the VPC Link live here."
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "availability_zone" {
  description = "Primary AZ (existing public subnet + EC2)."
  type        = string
}

variable "availability_zone_b" {
  description = "Second AZ, required for the ALB and VPC Link."
  type        = string
}

variable "nat_instance_type" {
  description = "NAT instance size. t4g.nano (~$3-4/mo) replaces a ~$32/mo NAT Gateway."
  type        = string
  default     = "t4g.nano"
}

variable "region" {
  type = string
}
