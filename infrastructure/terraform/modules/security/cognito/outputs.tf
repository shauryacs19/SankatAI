output "user_pool_id" {
  value = aws_cognito_user_pool.users.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.users.arn
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.app.id
}

output "user_pool_domain" {
  value = aws_cognito_user_pool_domain.signin.domain
}

output "hosted_ui_domain" {
  description = "Cognito OAuth origin (social sign-in): VITE_COGNITO_DOMAIN / EXPO_PUBLIC_COGNITO_DOMAIN."
  value       = "https://${aws_cognito_user_pool_domain.signin.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}

output "social_providers" {
  description = "Social providers enabled on the app client, e.g. [\"Google\", \"Facebook\"]."
  value = concat(
    aws_cognito_identity_provider.google[*].provider_name,
    aws_cognito_identity_provider.facebook[*].provider_name,
  )
}

data "aws_region" "current" {}
