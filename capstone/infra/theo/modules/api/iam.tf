# modules/api/iam.tf
#
# The API Lambda's role. Least privilege, route by route:
#   read the device state and the schedule and savings it shows,
#   read AND write the settings,
#   ask for a re-plan on the queue,
#   publish plug commands, but only to a device's control topic.

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.project_name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api" {
  name = "api-permissions"
  role = aws_iam_role.api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadStateSettings"
        Effect   = "Allow"
        Action   = "dynamodb:GetItem"
        Resource = [var.table_arns["device-state"], var.table_arns["settings"]]
      },
      {
        Sid      = "ReadScheduleAndSavings"
        Effect   = "Allow"
        Action   = "dynamodb:Query"
        Resource = [var.table_arns["schedules"], var.table_arns["savings"]]
      },
      {
        Sid      = "SaveSettings"
        Effect   = "Allow"
        Action   = "dynamodb:PutItem"
        Resource = var.table_arns["settings"]
      },
      {
        Sid      = "AskForReplan"
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = var.replan_queue_arn
      },
      {
        # Control topics only: the API can plug a car in or out, nothing more.
        Sid      = "PlugCommands"
        Effect   = "Allow"
        Action   = "iot:Publish"
        Resource = "arn:aws:iot:${var.region}:${data.aws_caller_identity.current.account_id}:topic/theo/*/control"
      },
    ]
  })
}
