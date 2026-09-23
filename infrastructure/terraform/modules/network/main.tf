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
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidr
  availability_zone = var.availability_zone

  # Explicit per-instance instead: only the NAT instance below opts in
  # (associate_public_ip_address = true). Nothing else should launch here
  # and inherit a public IP by default.
  map_public_ip_on_launch = false

  tags = {
    Name    = "${var.project_name}-public-subnet"
    Project = var.project_name
  }
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_b_cidr
  availability_zone = var.availability_zone_b

  # Unused today (no resource is placed here) — kept off by default for the
  # same reason as "public" above.
  map_public_ip_on_launch = false

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

# ── NAT instance management ─────────────────────────────────────────────────
# The NAT sits in a PUBLIC subnet with its own public IP and a direct route to
# the internet gateway, so its SSM agent reaches the service endpoints without
# depending on the very forwarding this instance provides. That makes it the
# one node guaranteed reachable when private-subnet egress is broken - which is
# exactly when you need to get in and look at iptables.
# AL2023 ships amazon-ssm-agent preinstalled and enabled, so the profile is all
# that was missing.
data "aws_iam_policy_document" "nat_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "nat" {
  name               = "${var.project_name}-nat-role"
  assume_role_policy = data.aws_iam_policy_document.nat_assume.json

  tags = {
    Name    = "${var.project_name}-nat-role"
    Project = var.project_name
  }
}

resource "aws_iam_role_policy_attachment" "nat_ssm" {
  role       = aws_iam_role.nat.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "nat" {
  name = "${var.project_name}-nat-profile"
  role = aws_iam_role.nat.name
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

  # Unrestricted egress, deliberately, and it is NOT a regression to tighten.
  #
  # A NAT instance forwards traffic it does not originate. The SG sees FOUR
  # legs, not two, because MASQUERADE rewrites the source address:
  #   1 in   private -> internet   (arrives on this ENI; ingress rule)
  #   2 out  NAT     -> internet   (post-MASQUERADE; needs egress)
  #   3 in   internet-> NAT        (reply to 2)
  #   4 out  internet-> private    (post-un-NAT; leaves THIS ENI toward the
  #                                 private subnet on the ORIGINAL ephemeral
  #                                 port, i.e. NOT 443/80)
  #
  # A port-restricted egress list covers leg 2 but not leg 4, so the reply
  # never reaches the private instance and every connection through the NAT
  # hangs until it times out - exactly the symptom of
  # "dial tcp <ssm-ip>:443: i/o timeout" from the SSM agent.
  #
  # Restricting this bought nothing anyway: the backend SG already limits what
  # the private side may send (443/80/NTP/DNS), so the NAT can only ever
  # forward traffic that was already permitted upstream. AWS's own NAT-instance
  # guidance uses unrestricted egress for this reason.
  #
  # AVD-AWS-0104 is suppressed for this rule in .trivyignore.yaml.
  egress {
    description = "NAT forwarding: arbitrary destinations for the private subnets, plus reply traffic back into the VPC"
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

  iam_instance_profile = aws_iam_instance_profile.nat.name

  # The subnet no longer auto-assigns a public IP (see aws_subnet.public), so
  # this instance opts in explicitly — it needs one to masquerade private
  # traffic out through the IGW.
  associate_public_ip_address = true

  # Mandatory for a NAT instance: it forwards packets that are neither from nor
  # to its own address, which the default check would drop.
  source_dest_check = false

  # No SSH key and no inbound rule from outside the VPC — this box is not
  # administered interactively.
  # user_data only runs on first boot, so without this an edit becomes an
  # in-place stop/start that never re-runs it - which is how a NAT with no
  # MASQUERADE rule survived several "fixes". Replacement also re-points the
  # private route at the new ENI in the same apply.
  user_data_replace_on_change = true

  user_data = <<-EOF
    #!/bin/bash
    set -eux
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-nat.conf

    # AL2023 ships neither iptables nor nft. Without this every rule below
    # fails with "command not found" and nothing is ever masqueraded. The NAT
    # reaches the repos directly via its own public IP, so no chicken-and-egg.
    for i in 1 2 3 4 5; do dnf install -y iptables-nft && break; sleep 10; done
    command -v iptables

    # Rules live in a script applied by a systemd oneshot at every boot.
    # The previous approach (dnf install iptables-services + iptables-save)
    # depended on a package AL2023 does not reliably provide; when that install
    # failed, `set -e` aborted user_data and the box came back after a reboot
    # forwarding nothing - the private subnets lose all egress, including SSM.
    # Rules are added idempotently (-C before -A) so re-running is safe.
    cat > /usr/local/sbin/nat-rules.sh <<'RULES'
    #!/bin/bash
    set -eu
    IFACE=$(ip -o -4 route show to default | awk '{print $5}')
    iptables -t nat -C POSTROUTING -o "$IFACE" -s ${var.vpc_cidr} -j MASQUERADE 2>/dev/null       || iptables -t nat -A POSTROUTING -o "$IFACE" -s ${var.vpc_cidr} -j MASQUERADE
    iptables -C FORWARD -i "$IFACE" -o "$IFACE" -j ACCEPT 2>/dev/null       || iptables -A FORWARD -i "$IFACE" -o "$IFACE" -j ACCEPT
    RULES
    chmod +x /usr/local/sbin/nat-rules.sh

    cat > /etc/systemd/system/nat-rules.service <<'UNIT'
    [Unit]
    Description=SankatAI NAT masquerade rules
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=oneshot
    RemainAfterExit=yes
    ExecStart=/usr/local/sbin/nat-rules.sh

    [Install]
    WantedBy=multi-user.target
    UNIT

    systemctl daemon-reload
    systemctl enable --now nat-rules.service
  EOF

  # Force IMDSv2 on the NAT box too — same SSRF-to-credential-theft rationale
  # as the backend instance, even though this instance carries no app role.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

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

# ── Optional: SSM interface endpoints ───────────────────────────────────────
# OFF by default. The NAT path is the intended design and costs ~$4/mo; these
# three interface endpoints cost roughly $7.20/mo EACH per AZ (~$43/mo across
# both private subnets), which is why they are not the default.
#
# Turn on with -var="enable_ssm_vpc_endpoints=true" if the NAT path cannot be
# made reliable. They give the private subnets a direct path to Systems Manager
# that does not traverse the NAT at all, so SSM keeps working even if NAT
# forwarding is broken.
resource "aws_security_group" "ssm_endpoints" {
  count = var.enable_ssm_vpc_endpoints ? 1 : 0

  name        = "${var.project_name}-ssm-endpoints-sg"
  description = "SSM interface endpoints: HTTPS from inside the VPC only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from the private subnets"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name    = "${var.project_name}-ssm-endpoints-sg"
    Project = var.project_name
  }
}

resource "aws_vpc_endpoint" "ssm" {
  for_each = var.enable_ssm_vpc_endpoints ? toset(["ssm", "ssmmessages", "ec2messages"]) : toset([])

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [one(aws_security_group.ssm_endpoints[*].id)]
  private_dns_enabled = true

  tags = {
    Name    = "${var.project_name}-${each.key}-endpoint"
    Project = var.project_name
  }
}

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
