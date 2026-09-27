# Launch Template
resource "aws_launch_template" "web_app" {
  name        = "web-app-launch-template"
  description = "A web server for the load test app"

  image_id      = var.ami_id
  instance_type = var.instance_type

  network_interfaces {
    security_groups = [data.terraform_remote_state.root.outputs.private_instance_sg_id]
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "WebApp"
    }
  }
}

# ASG mental model in two resources: 
# The listner target group itself (what/where/how-many), and the policy (when to add/remove)

# The ASG — launches WebApp instances from the template above, 
# keeps 2-4 running, registers them into the target group so the ALB can route to them
resource "aws_autoscaling_group" "web_app" {
  name = "Web_App_ASG"

  vpc_zone_identifier = [
    data.terraform_remote_state.root.outputs.private_subnet_id_e1a,
    data.terraform_remote_state.root.outputs.private_subnet_id_e1b
  ]

  # Tells the ASG which target group to register/deregister instances in as it scales
  # use the ALB's health check (not just "is the instance running"), so unhealthy-but-alive instances get replaced
  target_group_arns = [aws_lb_target_group.webserver_app.arn]
  health_check_type = "ELB"

  desired_capacity = 2
  min_size         = 2
  max_size         = 4

  launch_template {
    id      = aws_launch_template.web_app.id
    version = "$Latest" # always use whichever launch template version is newest
  }

  tag {
    key                 = "Name"
    value               = "Auto Scale WebApp"
    propagate_at_launch = true # copies this tag onto every instance the ASG launches, not just the ASG resource itself
  }
}

# Scaling policy — keeps average CPU across the group near 30%, 
# adding/removing instances automatically as load changes
resource "aws_autoscaling_policy" "cpu_target_tracking" {
  name                   = "web-app-cpu-target-tracking"
  autoscaling_group_name = aws_autoscaling_group.web_app.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 30.0
  }
}
