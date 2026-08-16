output "repository_url" {
  description = "docker push target for CI."
  value       = aws_ecr_repository.backend.repository_url
}

output "repository_arn" {
  value = aws_ecr_repository.backend.arn
}

output "github_actions_role_arn" {
  description = "Set as the role-to-assume in the GitHub Actions OIDC step."
  value       = aws_iam_role.github_actions.arn
}
