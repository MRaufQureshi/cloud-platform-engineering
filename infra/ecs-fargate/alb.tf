# ======================================
# LOAD BALANCER — the only public entry point
# Request path: internet -> listener :80 -> target group -> healthy task IPs
# ======================================

# 1. The load balancer itself. Gives you one stable DNS name; the task IPs
#    behind it change on every deploy and nobody outside ever sees them.
resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]

  # Needs subnets in at least two AZs — the reason var.azs has a validation.
  subnets = aws_subnet.public[*].id

  # false so `terraform destroy` is not blocked.
  enable_deletion_protection = false

  tags = {
    Name = "${var.project}-alb"
  }
}

# 2. Target group
resource "aws_lb_target_group" "main" {
  name     = "${var.project}-tg"
  port     = var.container_port
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  # "ip", not "instance": awsvpc gives each Fargate task its own ENI and private
  # IP. There is no EC2 instance to register.
  target_type = "ip"

  # How long a draining task keeps existing connections before it is killed.
  # The default is 300s, which makes every deploy and teardown feel broken.
  deregistration_delay = 30

  # The ALB polls this. Fail it and the task is removed and replaced
  health_check {
    path                = var.health_check_path
    matcher             = "200"
    interval            = 30 # seconds between checks
    timeout             = 5  # no answer within this = one failure
    healthy_threshold   = 2  # consecutive passes before traffic is sent
    unhealthy_threshold = 2  # consecutive fails before removal
  }
}

# 3. Listener — the rule that says what to do with what arrives on :80.
#    Port 80 only for now.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}
