output "role_arn" {
  description = "ARN of the backend IAM role."
  value       = aws_iam_role.backend.arn
}

output "role_name" {
  value = aws_iam_role.backend.name
}

output "instance_profile_name" {
  description = "Attach this instance profile to the backend EC2 instance."
  value       = aws_iam_instance_profile.backend.name
}

output "instance_profile_arn" {
  value = aws_iam_instance_profile.backend.arn
}
