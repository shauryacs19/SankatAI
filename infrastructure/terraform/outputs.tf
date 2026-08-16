output "cloudfront_domain_name" {
  description = "CloudFront URL for the web app."
  value       = module.frontend.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidations)."
  value       = module.frontend.cloudfront_distribution_id
}

output "frontend_bucket_name" {
  description = "S3 bucket hosting the built frontend."
  value       = module.frontend.bucket_name
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_user_pool_client_id" {
  value = module.cognito.user_pool_client_id
}

output "cognito_hosted_ui_domain" {
  description = "VITE_COGNITO_DOMAIN / EXPO_PUBLIC_COGNITO_DOMAIN for the PKCE flow."
  value       = module.cognito.hosted_ui_domain
}

# --- Network path ---
output "api_gateway_endpoint" {
  description = "Public API entry point. CloudFront /api/* origin; EXPO_PUBLIC_API_URL for mobile."
  value       = module.api_gateway.api_endpoint
}

output "internal_alb_dns_name" {
  description = "Private ALB DNS — resolvable only inside the VPC. Not a public endpoint."
  value       = module.alb.alb_dns_name
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "backend_instance_id" {
  description = "Connect with: aws ssm start-session --target <this>"
  value       = module.backend_ec2.instance_id
}

# --- CI/CD ---
output "ecr_repository_url" {
  value = module.ecr.repository_url
}

output "github_actions_role_arn" {
  description = "role-to-assume for the GitHub Actions OIDC step. No access keys required."
  value       = module.ecr.github_actions_role_arn
}

# --- Secrets ---
output "ai_api_key_secret_name" {
  description = "Backend OPENAI_API_KEY_SECRET_ID."
  value       = module.secrets.ai_api_key_name
}

# --- Database (DynamoDB) --- plug these into the backend env
# (USERS_TABLE / CHAT_HISTORY_TABLE / ATTACHMENTS_TABLE).
output "users_table_name" {
  description = "DynamoDB user profiles table name (backend USERS_TABLE)."
  value       = module.database.user_profiles_table_name
}

output "chat_history_table_name" {
  description = "DynamoDB chat history table name (backend CHAT_HISTORY_TABLE)."
  value       = module.database.chat_history_table_name
}

output "attachments_table_name" {
  description = "DynamoDB attachments table name (backend ATTACHMENTS_TABLE)."
  value       = module.database.attachments_table_name
}

# --- Storage (S3 upload buckets) --- backend CHAT_BUCKET / DOCUMENTS_BUCKET.
output "chat_bucket_name" {
  description = "Transient chat-uploads S3 bucket (backend CHAT_BUCKET)."
  value       = module.storage.chat_bucket_name
}

output "documents_bucket_name" {
  description = "Retained medical-documents S3 bucket (backend DOCUMENTS_BUCKET)."
  value       = module.storage.file_bucket_name
}

# --- IAM --- attach this instance profile to the backend EC2 instance.
output "backend_instance_profile_name" {
  description = "EC2 instance profile granting the backend S3 + DynamoDB access."
  value       = module.iam.instance_profile_name
}

output "backend_role_arn" {
  value = module.iam.role_arn
}
