# Internal Application Load Balancer.
#
# `internal = true` means the ALB gets private IPs only and has no public DNS
# record that resolves outside the VPC — it cannot be reached from the internet
# regardless of security-group rules. It sits in the PRIVATE subnets: the only
# things that talk to it are the API Gateway VPC Link ENIs, which are also
# placed in those subnets.

resource "aws_security_group" "alb" {
  name        = "${var.project_name}-alb-sg"
  description = "Internal ALB: accepts traffic only from inside the VPC (VPC Link ENIs)"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from the API Gateway VPC Link ENIs"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description = "Forward to the backend target"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "${var.project_name}-alb-sg"
    Project = var.project_name
  }
}

resource "aws_lb" "backend" {
  name               = "${var.project_name}-internal-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.subnet_ids

  drop_invalid_header_fields = true
  enable_deletion_protection = false

  tags = {
    Name    = "${var.project_name}-internal-alb"
    Project = var.project_name
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.project_name}-backend-tg"
  port        = var.backend_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  health_check {
    enabled = true
    path    = var.health_check_path
    # /api/health is a liveness probe only — it returns no AWS or user data.
    # /api/health/readiness is deliberately NOT used here: it calls DynamoDB and
    # S3 on every probe, which would add cost and mark the target unhealthy on a
    # transient AWS blip.
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = {
    Name    = "${var.project_name}-backend-tg"
    Project = var.project_name
  }
}

resource "aws_lb_target_group_attachment" "backend" {
  target_group_arn = aws_lb_target_group.backend.arn
  target_id        = var.backend_instance_id
  port             = var.backend_port
}

# HTTP only. TLS terminates at API Gateway; this hop is private VPC traffic
# between the VPC Link ENIs and the ALB, and never traverses the internet.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
