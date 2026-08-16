output "user_pool_id" {
  value = aws_cognito_user_pool.sankatai.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.sankatai.arn
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.sankatai.id
}

output "user_pool_domain" {
  value = aws_cognito_user_pool_domain.sankatai.domain
}

output "hosted_ui_domain" {
  description = "Full Hosted UI origin — VITE_COGNITO_DOMAIN for the PKCE flow."
  value       = "https://${aws_cognito_user_pool_domain.sankatai.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

data "aws_region" "current" {}
