# Admin console tables (backend/app/repositories/admin_repository.py and
# audit_repository.py). On-demand billing; tiny, so effectively free at rest.

# Admins: pk=ADMIN sk=<cognito sub> (status active|revoked) and one counter row
# pk=META sk=ACTIVE_COUNT. Grants/revokes change row + counter in one
# transaction, which is how "never remove the last admin" is enforced.
resource "aws_dynamodb_table" "admins" {
  name         = "${var.project_name}-admins"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-admins"
    Project = var.project_name
  }
}

# Invitations: only a SHA-256 of the link secret is stored. email_lower-index
# finds an existing pending invite (rotate instead of duplicate);
# status-index lists invites without a Scan. `ttl` = expiry + 30 days.
resource "aws_dynamodb_table" "admin_invitations" {
  name         = "${var.project_name}-admin-invitations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "invitation_id"

  attribute {
    name = "invitation_id"
    type = "S"
  }

  attribute {
    name = "email_lower"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  global_secondary_index {
    name            = "email_lower-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "email_lower"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "created_at"
      key_type       = "RANGE"
    }
  }

  global_secondary_index {
    name            = "status-index"
    projection_type = "ALL"

    key_schema {
      attribute_name = "status"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "created_at"
      key_type       = "RANGE"
    }
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-admin-invitations"
    Project = var.project_name
  }
}

# Audit log: pk=AUDIT#<YYYY-MM>, sk=<iso ts>#<uuid>. Append-only by IAM: the
# backend role gets PutItem + Query on this table and nothing else. No TTL.
resource "aws_dynamodb_table" "admin_audit_log" {
  name         = "${var.project_name}-admin-audit-log"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-admin-audit-log"
    Project = var.project_name
  }
}
