output "alb_arn" {
  value = aws_lb.backend.arn
}

output "alb_dns_name" {
  description = "Private DNS name — resolvable only inside the VPC."
  value       = aws_lb.backend.dns_name
}

output "listener_arn" {
  description = "Target for the API Gateway VPC Link integration."
  value       = aws_lb_listener.http.arn
}

output "security_group_id" {
  description = "Allow this SG as the only ingress source on the backend SG."
  value       = aws_security_group.alb.id
}

output "target_group_arn" {
  value = aws_lb_target_group.backend.arn
}
