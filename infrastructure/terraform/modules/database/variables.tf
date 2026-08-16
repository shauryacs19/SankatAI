variable "project_name" {
  type = string
}

variable "user_profiles_table" {
  description = "Name segment for the user profiles table (final name is <project>-<segment>)."
  default     = "user-profile-table"
  type        = string
}

variable "chat_history_table" {
  description = "Name segment for the chat history table: consultations + messages (final name is <project>-<segment>)."
  default     = "chat-history"
  type        = string
}

variable "attachments_table" {
  description = "Name segment for the attachments (uploads) metadata table (final name is <project>-<segment>)."
  default     = "attachments"
  type        = string
}

# Point-in-time recovery — a safe default for tables holding user data. Set to
# false to match tables you created manually without PITR enabled.
variable "point_in_time_recovery" {
  description = "Enable DynamoDB point-in-time recovery on all tables."
  default     = true
  type        = bool
}
