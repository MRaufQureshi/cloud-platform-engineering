# modules/ingestion/iam.tf
#
# Each Lambda gets its own role with only what it needs. A Lambda role has two
# parts: the TRUST policy (who may assume it: the Lambda service) and the
# PERMISSIONS (what it may then do).
#
#   price fetcher   write the prices table, write prices/* in the data bucket,
#                   send to the replan queue, write its own logs
#   forecast stub   write its own logs, nothing else (it calls no AWS service)

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# --- price fetcher
resource "aws_iam_role" "price_fetcher" {
  name               = "${var.project_name}-price-fetcher"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

# Managed policy: create the log stream and write log lines, nothing more.
resource "aws_iam_role_policy_attachment" "price_fetcher_logs" {
  role       = aws_iam_role.price_fetcher.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "price_fetcher" {
  name = "fetch-and-store-prices"
  role = aws_iam_role.price_fetcher.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # PutItem for batch writes; Query for "do prices for today already exist?"
        Sid      = "PricesTable"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:BatchWriteItem", "dynamodb:Query"]
        Resource = var.prices_table_arn
      },
      {
        Sid      = "RawPriceFiles"
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${var.data_bucket_arn}/prices/*"
      },
      {
        Sid      = "AskForReplan"
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = var.replan_queue_arn
      },
    ]
  })
}

# --- forecast stub
resource "aws_iam_role" "forecast" {
  name               = "${var.project_name}-forecast"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "forecast_logs" {
  role       = aws_iam_role.forecast.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
