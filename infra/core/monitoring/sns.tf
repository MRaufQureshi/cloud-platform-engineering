# ============================================
# SNS TOPICS & SUBSCRIPTIONS
# ============================================

# Critical alerts topic
resource "aws_sns_topic" "critical_alerts" {
  name = "critical-alerts-${var.env_name}"

  tags = {
    Environment = var.env_name
    AlertType   = "Critical"
  }
}

# Warning alerts topic
resource "aws_sns_topic" "warning_alerts" {
  name = "warning-alerts-${var.env_name}"

  tags = {
    Environment = var.env_name
    AlertType   = "Warning"
  }
}

# Email subscriptions
resource "aws_sns_topic_subscription" "critical_email" {
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = var.sns_protocol
  endpoint  = var.alert_email
}

resource "aws_sns_topic_subscription" "warning_email" {
  topic_arn = aws_sns_topic.warning_alerts.arn
  protocol  = var.sns_protocol
  endpoint  = var.alert_email
}