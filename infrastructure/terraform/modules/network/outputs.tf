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

output "nat_instance_private_ip" {
  description = "NAT instance private IP. The private route table targets its ENI."
  value       = aws_instance.nat.private_ip
}

output "nat_security_group_id" {
  value = aws_security_group.nat.id
}

output "private_route_table_id" {
  description = "Route table whose 0.0.0.0/0 target is the NAT ENI. Verify with: aws ec2 describe-route-tables --route-table-ids <this>"
  value       = aws_route_table.private.id
}

output "public_route_table_id" {
  description = "Route table whose 0.0.0.0/0 target is the internet gateway."
  value       = aws_route_table.public.id
}
