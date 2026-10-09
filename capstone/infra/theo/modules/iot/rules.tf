# modules/iot/rules.tf
#
# IoT RULES: "when a message arrives on this topic, run this SQL on it and send
# the result somewhere". Serverless glue between devices and AWS services.
#
#   Rule A   theo/+/telemetry --> DynamoDB theo-telemetry    (history, auto-deleted after 24h)
#   Rule A2  theo/+/telemetry --> DynamoDB theo-device-state (latest reading per device)
#   Rule B   theo/+/event     --> SQS replan queue           (plug in / plug out -> re-plan)
#
# `+` is the single-level MQTT wildcard: theo/+/telemetry matches device-1, device-2, ...
# If a rule's action fails (say, a permission is wrong), the error action writes
# the failure to CloudWatch Logs so it is not lost silently.

# --- Where failed rule actions are logged
resource "aws_cloudwatch_log_group" "rule_errors" {
  name              = "/${var.project_name}/iot-rule-errors"
  retention_in_days = 7
}

# --- The role IoT assumes to write on the rules' behalf
data "aws_iam_policy_document" "rules_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["iot.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rules" {
  name               = "${var.project_name}-iot-rules"
  assume_role_policy = data.aws_iam_policy_document.rules_trust.json
}

resource "aws_iam_role_policy" "rules" {
  name = "write-telemetry-and-errors" # also allows Rule B to send to the queue
  role = aws_iam_role.rules.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PutItems"
        Effect   = "Allow"
        Action   = "dynamodb:PutItem"
        Resource = [var.telemetry_table_arn, var.device_state_table_arn]
      },
      {
        Sid    = "ErrorLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        # The log group's own ARN already ends in ":*" for streams
        Resource = "${aws_cloudwatch_log_group.rule_errors.arn}:*"
      },
      {
        Sid      = "SendReplanRequests"
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = var.replan_queue_arn
      },
    ]
  })
}

# --- Rule A: raw telemetry history
# `ts AS timestamp` renames the field to match the table's sort key.
# `ttl` is the epoch second after which DynamoDB deletes the row (now + 24h).
# timestamp() is IoT's own clock in milliseconds, so /1000 gives seconds.
resource "aws_iot_topic_rule" "telemetry" {
  name        = "${var.project_name}_telemetry_to_dynamodb"
  enabled     = true
  sql_version = "2016-03-23"
  sql         = "SELECT device_id, ts AS timestamp, soc, plugged_in, meter_kw, solar_kw, ev_power_kw, floor(timestamp() / 1000) + 86400 AS ttl FROM 'theo/+/telemetry'"

  dynamodbv2 {
    role_arn = aws_iam_role.rules.arn
    put_item {
      table_name = var.telemetry_table_name
    }
  }

  error_action {
    cloudwatch_logs {
      log_group_name = aws_cloudwatch_log_group.rule_errors.name
      role_arn       = aws_iam_role.rules.arn
    }
  }
}

# --- Rule A2: latest state per device (the table's key is device_id, so every
# new reading overwrites the previous one). `updated_at` is SIMULATED time: the
# optimizer reads it to learn what time it is inside the simulation.
resource "aws_iot_topic_rule" "device_state" {
  name        = "${var.project_name}_telemetry_to_device_state"
  enabled     = true
  sql_version = "2016-03-23"
  sql         = "SELECT device_id, soc, plugged_in, ev_power_kw AS power_kw, ts AS updated_at FROM 'theo/+/telemetry'"

  dynamodbv2 {
    role_arn = aws_iam_role.rules.arn
    put_item {
      table_name = var.device_state_table_name
    }
  }

  error_action {
    cloudwatch_logs {
      log_group_name = aws_cloudwatch_log_group.rule_errors.name
      role_arn       = aws_iam_role.rules.arn
    }
  }
}

# --- Rule B: a plug event asks the optimizer for a new plan.
# Devices publish an event ONLY when the plug state changes, so this rule needs
# no logic to detect changes. The SQL reshapes the device's event into the
# message the queue expects:
#   {"device_id": "device-1", "reason": "plug_in", "plugged_in": true, "soc": 0.5, "ts": "..."}
# plugged_in / soc / ts carry the NEW state with the event. Without them the
# optimizer would read theo-device-state, which only refreshes with the next
# telemetry (every 10 s), and would still see the OLD state: a race.
resource "aws_iot_topic_rule" "replan" {
  name        = "${var.project_name}_event_to_replan_queue"
  enabled     = true
  sql_version = "2016-03-23"
  sql         = "SELECT device_id, event AS reason, plugged_in, soc, ts FROM 'theo/+/event'"

  sqs {
    queue_url  = var.replan_queue_url
    role_arn   = aws_iam_role.rules.arn
    use_base64 = false
  }

  error_action {
    cloudwatch_logs {
      log_group_name = aws_cloudwatch_log_group.rule_errors.name
      role_arn       = aws_iam_role.rules.arn
    }
  }
}
