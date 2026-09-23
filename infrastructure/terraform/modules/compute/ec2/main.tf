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

  # ORDER MATTERS. The SSM agent is enabled FIRST, before anything that needs
  # the network.
  #
  # The previous version ran `apt-get update` as its first command under
  # `set -eux`. If the NAT path was not up yet (NAT still booting, or its
  # iptables/SG broken) that apt call failed, `set -e` aborted the whole
  # script, and execution never reached the line that enables the SSM agent -
  # so the instance came up permanently unregistered and, with no SSH, there
  # was no way in to fix it. That is the "running, healthy, not in SSM" state.
  #
  # `set -e` is therefore dropped and every network-dependent step is made
  # non-fatal: a transient outage degrades the box, it no longer strands it.
  user_data = <<-EOF
    #!/bin/bash
    set -ux
    exec > >(tee -a /var/log/sankatai-user-data.log) 2>&1

    # ── 1. SSM agent - no internet required to start it ──────────────────
    # Ubuntu 24.04 ships amazon-ssm-agent as a preinstalled snap. Starting and
    # enabling it is purely local; the agent then retries registration on its
    # own until the NAT path works, so the node self-heals once networking is
    # fixed instead of needing a rebuild. --enable also makes it survive reboot.
    snap start --enable amazon-ssm-agent \
      || systemctl enable --now snap.amazon-ssm-agent.amazon-ssm-agent.service \
      || true

    # ── 2. Everything below needs egress through the NAT instance ────────
    for i in 1 2 3 4 5; do
      apt-get update -y && break
      echo "apt-get update failed (attempt $i) - retrying in 15s"
      sleep 15
    done

    apt-get install -y docker.io docker-compose-v2 unzip git || true
    systemctl enable docker || true
    systemctl start docker || true
    usermod -aG docker ubuntu || true

    # CloudWatch agent for application/system logs. Best effort.
    curl -fsSL -o /tmp/cwagent.deb \
      https://s3.${data.aws_region.current.region}.amazonaws.com/amazoncloudwatch-agent-${data.aws_region.current.region}/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb \
      && dpkg -i -E /tmp/cwagent.deb || true
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
