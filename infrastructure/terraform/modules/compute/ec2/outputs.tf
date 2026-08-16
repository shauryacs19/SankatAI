output "instance_id" {
  description = "ID of the SankatAI backend EC2 instance"
  value       = aws_instance.backend.id
}

output "public_ip" {
  description = "Public IP address of the backend EC2 instance"
  value       = aws_instance.backend.public_ip
}

output "private_ip" {
  description = "Private IP address of the backend EC2 instance"
  value       = aws_instance.backend.private_ip
}

output "public_dns" {
  description = "Public DNS name of the backend EC2 instance"
  value       = aws_instance.backend.public_dns
}

output "instance_arn" {
  description = "ARN of the backend EC2 instance"
  value       = aws_instance.backend.arn
}