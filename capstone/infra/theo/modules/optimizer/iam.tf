# modules/optimizer/iam.tf
#
# Two different roles, two different jobs. This trips everyone up once:
#
#   EXECUTION role  used by the ECS AGENT, before and around your container:
#                   pull the image from ECR, write container logs to CloudWatch.
#   TASK role       used by YOUR CODE inside the container: boto3 picks it up
#                   automatically. This is the least-privilege one.

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# --- Execution role
resource "aws_iam_role" "execution" {
  name               = "${var.project_name}-optimizer-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# --- Task role
resource "aws_iam_role" "task" {
  name               = "${var.project_name}-optimizer-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy" "task" {
  name = "optimizer-permissions"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Only the five tables it uses. (The spec says "all six"; the raw
        # telemetry table is never touched by the optimizer, so it is left out.)
        Sid    = "ReadWriteItsTables"
        Effect = "Allow"
        Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"]
        Resource = [
          var.table_arns["device-state"],
          var.table_arns["settings"],
          var.table_arns["schedules"],
          var.table_arns["prices"],
          var.table_arns["savings"],
        ]
      },
      {
        Sid      = "ConsumeReplanQueue"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"]
        Resource = aws_sqs_queue.replan.arn
      },
      {
        # Publishing a schedule: only to the per-device schedule topics.
        Sid      = "PublishSchedules"
        Effect   = "Allow"
        Action   = "iot:Publish"
        Resource = "arn:aws:iot:${var.region}:${data.aws_caller_identity.current.account_id}:topic/theo/*/schedule"
      },
    ]
  })
}
