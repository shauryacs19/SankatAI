variable "project_name" {
  type = string
}

# Backend API origin for the CloudFront /api/* behavior. Leave empty to serve
# only the static site (no /api routing). Must be a DNS name, not a bare IP —
# e.g. the EC2 public DNS "ec2-13-206-81-32.ap-south-1.compute.amazonaws.com".
variable "backend_origin_domain" {
  type    = string
  default = ""
}

variable "backend_origin_port" {
  type    = number
  default = 8000
}
