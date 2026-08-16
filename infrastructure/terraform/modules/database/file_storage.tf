# Attachments metadata table (which uploaded file belongs to which user/chat).
# App access pattern (backend/app/repositories/attachment_repository.py):
#   hash  user_id
#   range attachment_id
#   GetItem/PutItem/DeleteItem by (user_id, attachment_id); Query by user_id to
#   list a user's attachments. Only the key attributes are declared.
resource "aws_dynamodb_table" "attachments" {
  name         = "${var.project_name}-${var.attachments_table}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "attachment_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "attachment_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-${var.attachments_table}"
    Project = var.project_name
  }
}
