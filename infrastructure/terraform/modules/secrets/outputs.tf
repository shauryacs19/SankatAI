output "ai_api_key_arn" {
  description = "Grant GetSecretValue on this ARN to the backend role."
  value       = aws_secretsmanager_secret.ai_api_key.arn
}

output "ai_api_key_name" {
  description = "Backend OPENAI_API_KEY_SECRET_ID."
  value       = aws_secretsmanager_secret.ai_api_key.name
}
