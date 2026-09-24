# =======================================================================
# Elastic Container Service — Registry, Logs, IAM, Cluster, Task, Service
# =======================================================================

# 1. Registry. The image must exist before a task can start.
resource "aws_ecr_repository" "main" {
  name = var.project
  # IMMUTABLE: a pushed tag can never be overwritten. This is what makes
  # rolling back to an old SHA meaningful. Re-pushing the same SHA now fails.
  image_tag_mutability = "IMMUTABLE"

  force_delete = true
  image_scanning_configuration {
    scan_on_push = true
  }
}

# 2. Log destination. Created here so the execution role never needs
#    logs:CreateLogGroup — the permission the managed policy is missing.
resource "aws_cloudwatch_log_group" "main" {
  name              = "/ecs/${var.project}"
  retention_in_days = var.log_retention_days
}

# 3. Execution role — used by the ECS AGENT to pull the image and write logs.
# There is deliberately no task role: the app calls no AWS APIs, so it gets no AWS identity.
resource "aws_iam_role" "execution" {
  name = "${var.project}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# 4. Cluster. On Fargate this is close to nothing — a namespace for services.
resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"
}

# 5. Task definition — the immutable recipe. Every change registers a new revision; revisions are your rollback menu.
resource "aws_ecs_task_definition" "main" {
  family                   = var.project
  requires_compatibilities = ["FARGATE"]

  # awsvpc gives each task its own ENI, its own private IP, its own security
  # group. It is why the target group uses target_type = "ip".
  network_mode = "awsvpc"

  cpu                = var.task_cpu
  memory             = var.task_memory
  execution_role_arn = aws_iam_role.execution.arn

  # A JSON string, not HCL — jsonencode lets you write HCL and serialises it.
  container_definitions = jsonencode([{
    name      = var.project
    image     = "${aws_ecr_repository.main.repository_url}:${var.image_tag}"
    essential = true # this container dies -> the whole task dies

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.main.name
        awslogs-region        = var.region
        awslogs-stream-prefix = "ecs"
        # false because Terraform already made the group. true would call
        # logs:CreateLogGroup on every task start, which the execution role cannot do
        
        # awslogs-create-group = "false"
      }
    }
  }])
}

# 6. Service — keeps N tasks alive and replaces them on deploy.
resource "aws_ecs_service" "main" {
  name            = "${var.project}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.public[*].id
    security_groups = [aws_security_group.task.id]

    # Public IP instead of a NAT Gateway (~$32/mo). The task is still private:
    # only the ALB's security group can reach it.
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = var.project # must match the name in container_definitions
    container_port   = var.container_port
  }

  # Roll forward only when a replacement is proven healthy, then stop the old.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Not on by default via the API — only the console wizard sets it. This is
  # the Phase 6 bug: without it a broken deploy retries forever.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # THE OWNERSHIP SPLIT: Terraform owns the platform, CI owns the image.
  # CI registers a new revision on every deploy. Without this, the next
  # `terraform apply` would drag the service back to revision 1.
  # desired_count is ignored too, so autoscaling or an incident-time scale
  # is not reverted.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  # ECS will not register targets before a listener exists, and Terraform
  # cannot infer that from the references alone.
  depends_on = [aws_lb_listener.http]
}