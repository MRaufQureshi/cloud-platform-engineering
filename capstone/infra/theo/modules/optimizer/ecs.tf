# modules/optimizer/ecs.tf
#
# Cluster -> service -> task definition, as in infra/ecs-fargate. The big
# difference: the task sits in PRIVATE subnets with NO public IP. The network
# module's VPC endpoints (ECR, Logs, SQS, S3, DynamoDB) and the NAT gateway
# (IoT data endpoint) are its only ways out.

data "aws_iot_endpoint" "data" {
  endpoint_type = "iot:Data-ATS"
}

resource "aws_cloudwatch_log_group" "optimizer" {
  name              = "/ecs/${var.project_name}-optimizer"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  # Publishes RunningTaskCount, which the "optimizer not running" alarm watches.
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "optimizer" {
  family                   = "${var.project_name}-optimizer"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc" # the task gets its own network interface and security group
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64" # the image is built for linux/amd64
  }

  container_definitions = jsonencode([{
    name      = "optimizer"
    image     = "${aws_ecr_repository.optimizer.repository_url}:${var.image_tag}"
    essential = true

    portMappings = [{ containerPort = 8000, protocol = "tcp" }] # Prometheus metrics

    environment = [
      { name = "AWS_REGION", value = var.region },
      { name = "REPLAN_QUEUE_URL", value = aws_sqs_queue.replan.url },
      { name = "IOT_ENDPOINT", value = data.aws_iot_endpoint.data.endpoint_address },
      { name = "TABLE_DEVICE_STATE", value = var.table_names["device-state"] },
      { name = "TABLE_SETTINGS", value = var.table_names["settings"] },
      { name = "TABLE_SCHEDULES", value = var.table_names["schedules"] },
      { name = "TABLE_PRICES", value = var.table_names["prices"] },
      { name = "TABLE_SAVINGS", value = var.table_names["savings"] },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.optimizer.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "optimizer"
      }
    }
  }])
}

resource "aws_ecs_service" "optimizer" {
  name            = "${var.project_name}-optimizer-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.optimizer.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.fargate_sg_id]
    assign_public_ip = false # the whole point: nothing on the internet can reach this task
  }

  # CI registers a new task definition revision on every deploy (the new image
  # tag) and points the service at it. Without this, the next `terraform apply`
  # would see that as drift and roll the service BACK to the bootstrap image.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}
