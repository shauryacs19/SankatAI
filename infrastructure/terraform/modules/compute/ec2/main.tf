data "aws_ami" "ubuntu" {
  most_recent = true

  owners = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# Backend application host.
#
# PRIVATE subnet, no public IP, no SSH. Administration is via SSM Session
# Manager, which works outbound-only — the agent dials out to the SSM endpoints
# through the NAT instance, so no inbound rule is needed for shell access.
#
# Ubuntu 24.04 ships snap-based amazon-ssm-agent preinstalled and enabled.
resource "aws_instance" "backend" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.backend.id]

  # Belt and braces: even if the subnet's map_public_ip_on_launch were flipped
  # on, this instance would still not get a public address.
  associate_public_ip_address = false

  iam_instance_profile = var.iam_instance_profile

  user_data = <<-EOF
    #!/bin/bash
    set -eux

    apt-get update -y
    apt-get install -y \
      docker.io \
      docker-compose-v2 \
      unzip \
      git

    systemctl enable docker
    systemctl start docker
    usermod -aG docker ubuntu

    # SSM agent ships with Ubuntu 24.04 as a snap; make sure it is running so
    # Session Manager works without SSH.
    snap start amazon-ssm-agent || systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service || true

    # CloudWatch agent for application/system logs.
    curl -fsSL -o /tmp/cwagent.deb \
      https://s3.${data.aws_region.current.region}.amazonaws.com/amazoncloudwatch-agent-${data.aws_region.current.region}/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
    dpkg -i -E /tmp/cwagent.deb || true
    rm -f /tmp/cwagent.deb
  EOF

  # Force IMDSv2: blocks the SSRF-to-credential-theft path against the instance
  # role, which matters more now that the role is the only way the app reaches AWS.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name        = "${var.project_name}-backend"
    Project     = var.project_name
    Environment = "dev"
  }
}

data "aws_region" "current" {}

resource "aws_security_group" "backend" {
  name        = "${var.project_name}-backend-sg"
  description = "Backend: application port from the ALB only, no public ingress"
  vpc_id      = var.vpc_id

  # No SSH rule and no 0.0.0.0/0 rule, by design. The only inbound path is the
  # internal ALB; shell access is SSM Session Manager (outbound-initiated).
  ingress {
    description     = "FastAPI from the internal ALB only"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  # Egress is enumerated rather than "all protocols, all ports". The
  # destinations genuinely cannot be pinned to fixed CIDRs — Ollama Cloud
  # publishes no stable ranges, and the AWS APIs reached here (ECR, SSM,
  # Secrets Manager, CloudWatch) are regional service endpoints. S3 and
  # DynamoDB leave through the gateway VPC endpoints and are covered by the
  # 443 rule. What this does remove is every non-HTTP protocol and every
  # other port, which is where the real exposure was.
  egress {
    description = "HTTPS: Ollama Cloud, ECR, SSM, Secrets Manager, CloudWatch, S3/DynamoDB endpoints"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "HTTP: Ubuntu apt archives during instance bootstrap and deploys"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # DNS stays inside the VPC: the Route 53 resolver sits at VPC base + 2.
  egress {
    description = "DNS to the in-VPC resolver (UDP)"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "DNS to the in-VPC resolver (TCP, large responses)"
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  # Amazon Time Sync, link-local. Clock skew breaks SigV4 signing.
  egress {
    description = "NTP to the Amazon Time Sync Service"
    from_port   = 123
    to_port     = 123
    protocol    = "udp"
    cidr_blocks = ["169.254.169.123/32"]
  }

  tags = {
    Name    = "${var.project_name}-backend-sg"
    Project = var.project_name
  }
}
