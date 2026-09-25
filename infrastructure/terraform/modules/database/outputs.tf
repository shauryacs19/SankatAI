output "user_profiles_table_name" {
  description = "Name of the user profiles DynamoDB table"
  value       = aws_dynamodb_table.user_profiles.name
}

output "user_profiles_table_arn" {
  description = "ARN of the user profiles DynamoDB table"
  value       = aws_dynamodb_table.user_profiles.arn
}

output "chat_history_table_name" {
  description = "Name of the chat history DynamoDB table"
  value       = aws_dynamodb_table.chat_history.name
}

output "chat_history_table_arn" {
  description = "ARN of the chat history DynamoDB table"
  value       = aws_dynamodb_table.chat_history.arn
}

output "attachments_table_name" {
  description = "Name of the attachments metadata DynamoDB table"
  value       = aws_dynamodb_table.attachments.name
}

output "attachments_table_arn" {
  description = "ARN of the attachments metadata DynamoDB table"
  value       = aws_dynamodb_table.attachments.arn
}

# ── Admin console + analytics ────────────────────────────────────────────────
output "admins_table_name" {
  value = aws_dynamodb_table.admins.name
}

output "admins_table_arn" {
  value = aws_dynamodb_table.admins.arn
}

output "admin_invitations_table_name" {
  value = aws_dynamodb_table.admin_invitations.name
}

output "admin_invitations_table_arn" {
  value = aws_dynamodb_table.admin_invitations.arn
}

output "admin_audit_table_name" {
  value = aws_dynamodb_table.admin_audit_log.name
}

output "admin_audit_table_arn" {
  value = aws_dynamodb_table.admin_audit_log.arn
}

output "analytics_events_table_name" {
  value = aws_dynamodb_table.analytics_events.name
}

output "analytics_events_table_arn" {
  value = aws_dynamodb_table.analytics_events.arn
}

output "analytics_agg_table_name" {
  value = aws_dynamodb_table.analytics_daily_agg.name
}

output "analytics_agg_table_arn" {
  value = aws_dynamodb_table.analytics_daily_agg.arn
}
