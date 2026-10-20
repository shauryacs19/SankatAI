output "ml_artifacts_bucket_name" {
  value = aws_s3_bucket.ml_artifacts.bucket
}

output "ml_artifacts_bucket_arn" {
  value = aws_s3_bucket.ml_artifacts.arn
}

output "triage_feedback_table_name" {
  value = aws_dynamodb_table.triage_feedback.name
}

output "triage_feedback_table_arn" {
  value = aws_dynamodb_table.triage_feedback.arn
}

output "model_retrain_role_arn" {
  description = "GitHub secret AWS_RETRAIN_ROLE_ARN for the retrain workflow."
  value       = aws_iam_role.model_retrain.arn
}
