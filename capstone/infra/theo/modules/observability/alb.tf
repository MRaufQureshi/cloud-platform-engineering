# ======================================
# LOAD BALANCER — you --:80--> [ALB in both public subnets] --:3000--> [Grafana on the box]
#                  listener -> target group -> the box, if its health check passes
# ======================================

# A load balancer in front of Grafana. Why bother with one box?
#   - a stable address: it stays the same when the box is replaced
#   - the box no longer faces the internet: its firewall only lets the ALB in

resource "aws_lb" "grafana" {
  name               = "${var.project_name}-grafana"
  load_balancer_type = "application"
  internal           = false # reachable from the internet, but alb-sg only lets my IP in
  security_groups    = [var.alb_security_group_id]
  subnets            = var.public_subnet_ids
}

# The list of machines the ALB may send traffic to, and how it checks they are alive.
resource "aws_lb_target_group" "grafana" {
  name        = "${var.project_name}-grafana"
  port        = 3000
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = var.vpc_id

  health_check {
    path    = "/api/health" # Grafana answers 200 here when it is up
    matcher = "200"
  }
}

resource "aws_lb_target_group_attachment" "grafana" {
  target_group_arn = aws_lb_target_group.grafana.arn
  target_id        = aws_instance.observability.id
  port             = 3000
}

# "Anything arriving on port 80: hand it to the target group."
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.grafana.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.grafana.arn
  }
}
