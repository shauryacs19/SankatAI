output "chat_bucket_name" {
  description = "Name of the transient chat-uploads S3 bucket."
  value       = aws_s3_bucket.chat_uploads.bucket
}

output "chat_bucket_arn" {
  value = aws_s3_bucket.chat_uploads.arn
}

output "file_bucket_name" {
  description = "Name of the retained medical-documents (vault) S3 bucket."
  value       = aws_s3_bucket.file_storage.bucket
}

output "file_bucket_arn" {
  value = aws_s3_bucket.file_storage.arn
}
