# ======================================
# SECURITY GROUPS
# Two groups, chained: the internet may reach the ALB, and only the ALB may
# reach the tasks. The tasks hold public IPs and are still unreachable
# directly, because nothing but the ALB's group is allowed in.
# ======================================

# The ALB is the only thing the internet may talk to.
resource "aws_security_group" "alb" {
  name        = "${var.project}-alb-sg"
  description = "Public entry point: internet to ALB on port 80"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Wide open egress on purpose. The tight version — egress only to the task
  # security group — creates a dependency cycle: the ALB SG would need the task
  # SG's id, while the task SG needs the ALB SG's id, and neither can be created
  # first. Terraform reports it as:
  #     Error: Cycle: aws_security_group.alb, aws_security_group.task
  # The general fix is separate aws_vpc_security_group_egress_rule resources,
  # which break the cycle because the rules are objects in their own right.
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1" #AWS's wildcard: "any protocol"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-alb-sg"
  }
}

# The tasks accept traffic from the ALB.
resource "aws_security_group" "task" {
  name        = "${var.project}-task-sg"
  description = "Fargate tasks: accept container port from the ALB only"
  vpc_id      = aws_vpc.main.id

  # security_groups, NOT cidr_blocks. This is the whole point: task IPs change
  # on every deploy, so a CIDR rule would be either wrong or far too wide.
  # Referencing the ALB's security group means "whatever is currently wearing
  # that badge" — it keeps working as tasks come and go.
  ingress {
    description     = "Container port from the ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Must stay open. The task pulls its image from ECR and ships logs to
  # CloudWatch over the public internet. Closing this produces
  # CannotPullContainerError, and it is a slow one to diagnose because the
  # task looks like it is simply stuck in PENDING.
  egress {
    description = "All outbound - ECR pull and CloudWatch Logs"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project}-task-sg"
  }
}
