# The observability box's identity. It may:
#   open a shell through SSM (no SSH keys)
#   read CloudWatch (so Grafana can draw AWS metrics)
#   read its config files from S3 and the Grafana password from Secrets Manager
#   ask ECS where the optimizer task is

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ec2_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "observability" {
  name               = "${var.project_name}-observability"
  assume_role_policy = data.aws_iam_policy_document.ec2_trust.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.observability.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_read" {
  role       = aws_iam_role.observability.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess"
}

resource "aws_iam_role_policy" "observability" {
  name = "observability-permissions"
  role = aws_iam_role.observability.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadConfigFiles"
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${var.data_bucket_arn}/observability/*"
      },
      {
        Sid       = "ListConfigFiles"
        Effect    = "Allow"
        Action    = "s3:ListBucket"
        Resource  = var.data_bucket_arn
        Condition = { StringLike = { "s3:prefix" = ["observability/*"] } }
      },
      {
        Sid      = "ReadGrafanaPassword"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = var.grafana_secret_arn
      },
      {
        # This call cannot be limited to one cluster, so it uses *.
        Sid      = "FindOptimizerTask"
        Effect   = "Allow"
        Action   = "ecs:ListTasks"
        Resource = "*"
      },
      {
        Sid      = "DescribeOptimizerTask"
        Effect   = "Allow"
        Action   = "ecs:DescribeTasks"
        Resource = "arn:aws:ecs:${var.region}:${data.aws_caller_identity.current.account_id}:task/${var.cluster_name}/*"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "observability" {
  name = "${var.project_name}-observability"
  role = aws_iam_role.observability.name
}
