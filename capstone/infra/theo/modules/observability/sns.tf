# SNS is AWS's notification service. An alarm publishes to the topic, and the
# topic sends an email to everyone subscribed.
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-alerts"
}

# AWS emails a confirmation link to this address. Alarm emails only start after
# someone clicks it.
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
