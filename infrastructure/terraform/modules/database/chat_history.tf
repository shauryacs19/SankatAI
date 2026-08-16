# Chat history table (single-table design).
# App access pattern (backend/app/repositories/consultation_repository.py):
#   hash  user_id
#   range chat_id   where the sort-key prefix distinguishes two row kinds:
#     CONSULT#{created_at}#{consultation_id}  -> a consultation record
#     MSG#{consultation_id}#{created_at}#{id} -> a chat message
#   Listing consultations / a consultation's messages is a single Query
#   (begins_with) each — no GSI or Scan required, so only the two key
#   attributes are declared here.
resource "aws_dynamodb_table" "chat_history" {
  name         = "${var.project_name}-${var.chat_history_table}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "chat_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "chat_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = {
    Name    = "${var.project_name}-${var.chat_history_table}"
    Project = var.project_name
  }
}
