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
