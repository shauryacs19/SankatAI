resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name    = "${var.project_name}-vpc"
    Project = var.project_name
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name    = "${var.project_name}-igw"
    Project = var.project_name
  }
}

# ── Public subnets ──────────────────────────────────────────────────────────
# Only the NAT instance and the ALB ENIs live here. No application workload.
# `public` keeps its original address/CIDR so it is not replaced in state.

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zone
  map_public_ip_on_launch = true

  tags = {
    Name    = "${var.project_name}-public-subnet"
    Project = var.project_name
  }
}

resource "aws_subnet" "public_b" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_b_cidr
  availability_zone       = var.availability_zone_b
  map_public_ip_on_launch = true

  tags = {
    Name    = "${var.project_name}-public-subnet-b"
    Project = var.project_name
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name    = "${var.project_name}-public-rt"
    Project = var.project_name
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# ── Private subnets ─────────────────────────────────────────────────────────
# The backend EC2 and the API Gateway VPC Link ENIs. No route to the IGW —
# outbound goes through the NAT instance below.

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = count.index == 0 ? var.availability_zone : var.availability_zone_b

  # Explicit: an instance here must never receive a public address.
  map_public_ip_on_launch = false

  tags = {
    Name    = "${var.project_name}-private-subnet-${count.index}"
    Project = var.project_name
    Tier    = "private"
  }
}

# ── NAT instance ────────────────────────────────────────────────────────────
# A t4g.nano running iptables masquerade, in place of a NAT Gateway
# (~$4/mo vs ~$32/mo). Trade-off: single AZ, single point of failure, and you
# patch it yourself. Acceptable for this project; a NAT Gateway (or one per AZ)
# is the answer if this ever needs real availability.
#
# Amazon Linux 2023 arm64 is used directly rather than a third-party NAT AMI so
# nothing depends on an image being published in this region.

data "aws_ami" "nat" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-arm64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_security_group" "nat" {
  name        = "${var.project_name}-nat-sg"
  description = "NAT instance: accept traffic only from inside the VPC"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Forwarded traffic from private subnets"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Outbound to the internet on behalf of private instances"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-nat-sg"
    Project = var.project_name
  }
}

resource "aws_instance" "nat" {
  ami                    = data.aws_ami.nat.id
  instance_type          = var.nat_instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.nat.id]

  # Mandatory for a NAT instance: it forwards packets that are neither from nor
  # to its own address, which the default check would drop.
  source_dest_check = false

  # No SSH key and no inbound rule from outside the VPC — this box is not
  # administered interactively.
  user_data = <<-EOF
    #!/bin/bash
    set -eux
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-nat.conf

    IFACE=$(ip -o -4 route show to default | awk '{print $5}')
    iptables -t nat -A POSTROUTING -o "$IFACE" -s ${var.vpc_cidr} -j MASQUERADE
    iptables -A FORWARD -i "$IFACE" -o "$IFACE" -j ACCEPT

    # Survive reboots.
    dnf install -y iptables-services
    iptables-save > /etc/sysconfig/iptables
    systemctl enable --now iptables
  EOF

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name    = "${var.project_name}-nat"
    Project = var.project_name
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block           = "0.0.0.0/0"
    network_interface_id = aws_instance.nat.primary_network_interface_id
  }

  tags = {
    Name    = "${var.project_name}-private-rt"
    Project = var.project_name
  }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# ── Gateway VPC endpoints (no hourly charge) ────────────────────────────────
# S3 and DynamoDB traffic skips the NAT instance entirely: less NAT bandwidth
# cost, lower latency, and the traffic never leaves the AWS network. Interface
# endpoints are deliberately NOT used — six of them would cost ~$44/mo, more
# than the NAT they would replace.

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = {
    Name    = "${var.project_name}-s3-endpoint"
    Project = var.project_name
  }
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]

  tags = {
    Name    = "${var.project_name}-dynamodb-endpoint"
    Project = var.project_name
  }
}
