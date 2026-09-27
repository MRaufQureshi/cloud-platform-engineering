# Target group is what the ASG attaches its instances to.
resource "aws_lb_target_group" "webserver_app" {
  name        = "webserver-app"
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = data.terraform_remote_state.root.outputs.vpc_id

  health_check {
    path = "/index.html"
  }
}

# The internet-facing entry point 
# spans both public subnets, forwards to the target group via the listener below.
resource "aws_lb" "webserver_elb" {
  name               = "WebServerELB"
  internal           = false
  load_balancer_type = "application"

  subnets = [
    data.terraform_remote_state.root.outputs.public_subnet_id_e1a,
    data.terraform_remote_state.root.outputs.public_subnet_id_e1b,
  ]
  security_groups = [data.terraform_remote_state.root.outputs.private_instance_sg_id]
}

# Listener
resource "aws_lb_listener" "webserver_http" {
  load_balancer_arn = aws_lb.webserver_elb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.webserver_app.arn
  }
}
