# modules/api/lambda.tf
#
# The one function behind all seven routes. Terraform zips apps/lambdas/api_handler,
# uploads it, and re-uploads whenever the code changes (same as modules/ingestion).

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${var.code_dir}/api_handler"
  output_path = "${path.module}/api_handler.zip"
  excludes    = ["tests", "__pycache__", ".pytest_cache"]
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-api"
  retention_in_days = 7
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-api"
  role          = aws_iam_role.api.arn
  runtime       = "python3.11"
  handler       = "handler.handler"
  timeout       = 10
  memory_size   = 256 # a user is waiting: more memory also means more CPU, so a faster cold start

  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256

  environment {
    variables = {
      DEVICE_IDS       = join(",", var.device_ids)
      IOT_ENDPOINT     = var.iot_endpoint
      REPLAN_QUEUE_URL = var.replan_queue_url
      TABLE_STATE      = var.table_names["device-state"]
      TABLE_SETTINGS   = var.table_names["settings"]
      TABLE_SCHEDULES  = var.table_names["schedules"]
      TABLE_SAVINGS    = var.table_names["savings"]
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy_attachment.logs]
}
