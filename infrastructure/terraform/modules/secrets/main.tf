# Application secrets.
#
# The old `auth_session_secret` (Fernet key for the custom web-session layer) is
# gone: authentication is Cognito + API Gateway now, so there is no server-side
# session to encrypt. Do not reintroduce it.
#
# AWS credentials are deliberately absent. EC2 authenticates to AWS with its
# instance role — storing access keys here would just move the problem.

resource "aws_secretsmanager_secret" "ai_api_key" {
  name                    = "${var.project_name}/${var.environment}/openai_api_key"
  description             = "API key for the OpenAI-protocol AI provider (currently Ollama Cloud)"
  recovery_window_in_days = 7

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

# The value is set out of band so the plaintext never enters Terraform state:
#   aws secretsmanager put-secret-value \
#     --secret-id sankatai/dev/openai_api_key --secret-string '<key>'
resource "aws_secretsmanager_secret_version" "ai_api_key" {
  secret_id     = aws_secretsmanager_secret.ai_api_key.id
  secret_string = "PLACEHOLDER"

  lifecycle {
    ignore_changes = [secret_string]
  }
}
