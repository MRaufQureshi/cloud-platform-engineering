# modules/optimizer/sqs.tf
#
# The replan queue: "something changed, please make a new plan".
#
#   senders:  IoT Rule B (plug in/out), the API Lambda (settings changed),
#             the price Lambda (new prices)
#   reader:   the optimizer
#
# A queue decouples them. If the optimizer is busy or restarting, requests wait
# instead of being lost. Message: {"device_id": "device-1", "reason": "plug_in"}.
#
# DEAD-LETTER QUEUE: a message the optimizer fails to process is handed out
# again after the visibility timeout. After 3 failed attempts SQS moves it to the
# DLQ instead of retrying forever, and a CloudWatch alarm (Phase 7) fires when
# the DLQ is not empty.

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project_name}-replan-dlq"
  message_retention_seconds = 1209600 # 14 days, the maximum: time to investigate
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "replan" {
  name = "${var.project_name}-replan-queue"

  # While the optimizer works on a message it is hidden from other readers for
  # this long. Must be longer than one solve + DynamoDB writes (seconds), or the
  # same message would be handled twice.
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400 # a re-plan request older than a day is useless
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}
