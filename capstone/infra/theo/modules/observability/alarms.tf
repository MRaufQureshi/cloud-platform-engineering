# Four CloudWatch alarms. Each watches one metric and publishes to the SNS topic
# when the metric crosses its limit.

# 1. A re-plan request has been waiting for more than 5 minutes: the optimizer is stuck or down.
resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_name          = "${var.project_name}-replan-queue-old-message"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = var.replan_queue_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 300 # seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# 2. A message failed three times and landed in the dead-letter queue.
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${var.project_name}-dlq-not-empty"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = var.dlq_name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# 3. The optimizer has no running task. Needs Container Insights on the cluster.
resource "aws_cloudwatch_metric_alarm" "optimizer_down" {
  alarm_name          = "${var.project_name}-optimizer-not-running"
  namespace           = "ECS/ContainerInsights"
  metric_name         = "RunningTaskCount"
  dimensions          = { ClusterName = var.cluster_name, ServiceName = var.service_name }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching" # no data at all also means no task
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# 4. No telemetry for 15 minutes: no message has reached the telemetry rule.
resource "aws_cloudwatch_metric_alarm" "no_telemetry" {
  alarm_name          = "${var.project_name}-no-telemetry"
  namespace           = "AWS/IoT"
  metric_name         = "TopicMatch"
  dimensions          = { RuleName = var.telemetry_rule_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3 # three 5-minute periods = 15 minutes
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
