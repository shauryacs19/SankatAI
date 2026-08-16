output "vpc_id" {
  value = aws_vpc.main.id
}

output "vpc_cidr" {
  value = aws_vpc.main.cidr_block
}

output "public_subnet_id" {
  value = aws_subnet.public.id
}

output "public_subnet_ids" {
  description = "Both public subnets — ALB/NAT placement only, no workloads."
  value       = [aws_subnet.public.id, aws_subnet.public_b.id]
}

output "private_subnet_ids" {
  description = "Backend EC2 and VPC Link ENIs."
  value       = aws_subnet.private[*].id
}

output "nat_instance_id" {
  value = aws_instance.nat.id
}
