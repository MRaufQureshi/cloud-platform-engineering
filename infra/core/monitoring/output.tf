# ============================================
# MONITORING OUTPUTS
# ============================================

output "monitored_instances" {
  description = "Information about monitored instances"
  value = {
    count        = local.instance_count
    instance_ids = local.instance_ids
    filter_name  = var.instance_name_tag
  }
}

output "dashboard_url" {
  description = "URL for the CloudWatch dashboard"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=${var.dashboard_name}"
}

output "sns_topic_arns" {
  description = "ARNs of the SNS topics"
  value = {
    critical = aws_sns_topic.critical_alerts.arn
    warning  = aws_sns_topic.warning_alerts.arn
  }
}

output "alarm_count" {
  description = "Total number of alarms created"
  value = {
    cpu_alarms          = length(aws_cloudwatch_metric_alarm.high_cpu)
    memory_alarms       = length(aws_cloudwatch_metric_alarm.high_memory)
    disk_alarms         = length(aws_cloudwatch_metric_alarm.low_disk_space)
    status_check_alarms = length(aws_cloudwatch_metric_alarm.instance_status_check)
  }
}