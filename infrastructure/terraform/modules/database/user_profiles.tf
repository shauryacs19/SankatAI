# User profiles table.
# App access pattern (backend/app/repositories/profile_repository.py):
#   GetItem / PutItem keyed by user_id -> one profile item per user.
# Only the key attribute is declared; non-key attributes (email, profile map,
# updated_at) are schemaless in DynamoDB.
resource "aws_dynamodb_table" "user_profiles" {
  name         = "${var.project_name}-${var.user_profiles_table}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  # Encryption at rest with an AWS-managed KMS key (DynamoDB is always encrypted;
  # this makes it explicit/auditable, matching the S3 buckets' SSE config).
  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-${var.user_profiles_table}"
    Project = var.project_name
  }
}
