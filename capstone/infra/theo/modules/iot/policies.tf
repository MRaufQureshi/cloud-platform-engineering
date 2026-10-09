# modules/iot/policies.tf
#
# One IoT policy PER DEVICE, least privilege. device-1's certificate can:
#   - connect, but only with the client ID "device-1"
#   - publish to its own telemetry and event topics
#   - subscribe and receive on its own control and schedule topics
# ...and nothing else. If device-1's key leaked, it could not read device-2's
# commands or pretend to be device-2.
#
# IoT policies use different resource ARN types per action:
#   iot:Connect            -> client/<id>
#   iot:Publish / Receive  -> topic/<name>
#   iot:Subscribe          -> topicfilter/<name>

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  iot_arn = "arn:aws:iot:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}"
}

resource "aws_iot_policy" "device" {
  for_each = toset(var.device_ids)

  name = "${var.project_name}-${each.key}-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "iot:Connect"
        Resource = "${local.iot_arn}:client/${each.key}"
      },
      {
        Effect = "Allow"
        Action = "iot:Publish"
        Resource = [
          "${local.iot_arn}:topic/theo/${each.key}/telemetry",
          "${local.iot_arn}:topic/theo/${each.key}/event",
        ]
      },
      {
        Effect = "Allow"
        Action = "iot:Subscribe"
        Resource = [
          "${local.iot_arn}:topicfilter/theo/${each.key}/control",
          "${local.iot_arn}:topicfilter/theo/${each.key}/schedule",
        ]
      },
      {
        Effect = "Allow"
        Action = "iot:Receive"
        Resource = [
          "${local.iot_arn}:topic/theo/${each.key}/control",
          "${local.iot_arn}:topic/theo/${each.key}/schedule",
        ]
      },
    ]
  })
}

resource "aws_iot_policy_attachment" "device" {
  for_each = toset(var.device_ids)

  policy = aws_iot_policy.device[each.key].name
  target = aws_iot_certificate.device[each.key].arn
}
