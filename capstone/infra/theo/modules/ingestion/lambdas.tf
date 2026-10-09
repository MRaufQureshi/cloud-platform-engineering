# modules/ingestion/lambdas.tf
#
# Two Lambda functions. The deployment package is a zip that Terraform builds
# from the source folder with archive_file. Edit handler.py, run apply: the zip's
# hash changes, so Terraform uploads the new code. No separate deploy step.
#
# Both run OUTSIDE the VPC on purpose: the price fetcher must reach the public
# aWATTar API, and a Lambda inside a private subnet would need the NAT for that.

data "archive_file" "price_fetcher" {
  type        = "zip"
  source_dir  = "${var.code_dir}/price_fetcher"
  output_path = "${path.module}/price_fetcher.zip"
  excludes    = ["tests", "__pycache__", ".pytest_cache"] # tests do not belong in the package
}

data "archive_file" "forecast" {
  type        = "zip"
  source_dir  = "${var.code_dir}/forecast"
  output_path = "${path.module}/forecast.zip"
  excludes    = ["tests", "__pycache__", ".pytest_cache"]
}

# Log groups are created here (not left to Lambda) so they get a retention and
# are deleted by `terraform destroy` instead of lingering for ever.
resource "aws_cloudwatch_log_group" "price_fetcher" {
  name              = "/aws/lambda/${var.project_name}-price-fetcher"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "forecast" {
  name              = "/aws/lambda/${var.project_name}-forecast"
  retention_in_days = 7
}

resource "aws_lambda_function" "price_fetcher" {
  function_name = "${var.project_name}-price-fetcher"
  role          = aws_iam_role.price_fetcher.arn
  runtime       = "python3.11"
  handler       = "handler.handler" # file handler.py, function handler()
  timeout       = 30                # aWATTar answers in well under 2 s; this is generous
  memory_size   = 128

  filename         = data.archive_file.price_fetcher.output_path
  source_code_hash = data.archive_file.price_fetcher.output_base64sha256

  environment {
    variables = {
      TABLE_PRICES     = var.prices_table_name
      DATA_BUCKET      = var.data_bucket_name
      REPLAN_QUEUE_URL = var.replan_queue_url
      DEVICE_IDS       = join(",", var.device_ids)
    }
  }

  depends_on = [aws_cloudwatch_log_group.price_fetcher, aws_iam_role_policy_attachment.price_fetcher_logs]
}

resource "aws_lambda_function" "forecast" {
  function_name = "${var.project_name}-forecast"
  role          = aws_iam_role.forecast.arn
  runtime       = "python3.11"
  handler       = "handler.handler"
  timeout       = 5
  memory_size   = 128

  filename         = data.archive_file.forecast.output_path
  source_code_hash = data.archive_file.forecast.output_base64sha256

  depends_on = [aws_cloudwatch_log_group.forecast, aws_iam_role_policy_attachment.forecast_logs]
}
