variable "project_name" {
  type = string
}

variable "chat_bucket" {
  description = "bucket for storing temporary chat attachments"
  default     = "chat-uploads"
  type        = string
}

variable "file_bucket" {
  description = "bucket for storing users medical files"
  default     = "file-storage"
  type        = string
}

# Browser origins allowed to PUT (presigned upload) / GET directly to S3.
# Restrict to your CloudFront URL + local dev origin in production, e.g.:
#   ["https://d3nweisrmywmv4.cloudfront.net", "http://localhost:5173"]
variable "cors_allowed_origins" {
  description = "Allowed browser origins for direct-to-S3 uploads/downloads."
  type        = list(string)
  default     = ["*"]
}