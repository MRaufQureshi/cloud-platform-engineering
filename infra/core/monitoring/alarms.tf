# ============================================
# CLOUDWATCH ALARMS
# ============================================

# High CPU utilization alarm
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  count = local.instance_count

  alarm_name          = "high-cpu-utilization-${substr(local.instance_ids[count.index], -8, 8)}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2 # Hardcoded
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = var.alarm_period_seconds # Uses module variable
  statistic           = "Average"
  threshold           = var.cpu_threshold # Uses module variable
  alarm_description   = "CPU utilization exceeds ${var.cpu_threshold}% for 2 periods"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  ok_actions          = [aws_sns_topic.critical_alerts.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = local.instance_ids[count.index]
  }

  tags = {
    Environment = var.env_name
    InstanceId  = local.instance_ids[count.index]
    AlertType   = "Critical"
  }
}

# High memory utilization alarm
resource "aws_cloudwatch_metric_alarm" "high_memory" {
  count = local.instance_count

  alarm_name          = "high-memory-utilization-${substr(local.instance_ids[count.index], -8, 8)}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2 # Hardcoded
  metric_name         = "MemoryUtilization"
  namespace           = "CWAgent"
  period              = var.alarm_period_seconds
  statistic           = "Average"
  threshold           = var.memory_threshold
  alarm_description   = "Memory utilization exceeds ${var.memory_threshold}% for 2 periods"
  alarm_actions       = [aws_sns_topic.warning_alerts.arn]
  ok_actions          = [aws_sns_topic.warning_alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = local.instance_ids[count.index]
  }

  tags = {
    Environment = var.env_name
    InstanceId  = local.instance_ids[count.index]
    AlertType   = "Warning"
  }
}

# Low disk space alarm
resource "aws_cloudwatch_metric_alarm" "low_disk_space" {
  count = local.instance_count

  alarm_name          = "low-disk-space-${substr(local.instance_ids[count.index], -8, 8)}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1 # Hardcoded
  metric_name         = "DiskSpaceUtilization"
  namespace           = "CWAgent"
  period              = var.alarm_period_seconds
  statistic           = "Average"
  threshold           = 20 # Hardcoded
  alarm_description   = "Disk space below 20% for 1 period"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  ok_actions          = [aws_sns_topic.critical_alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = local.instance_ids[count.index]
  }

  tags = {
    Environment = var.env_name
    InstanceId  = local.instance_ids[count.index]
    AlertType   = "Critical"
  }
}

# Instance status check alarm
resource "aws_cloudwatch_metric_alarm" "instance_status_check" {
  count = local.instance_count

  alarm_name          = "instance-status-check-failed-${substr(local.instance_ids[count.index], -8, 8)}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Instance status check failed for ${local.instance_ids[count.index]}"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = local.instance_ids[count.index]
  }

  tags = {
    Environment = var.env_name
    InstanceId  = local.instance_ids[count.index]
    AlertType   = "Critical"
  }
}

# System status check alarm
resource "aws_cloudwatch_metric_alarm" "system_status_check" {
  count = local.instance_count

  alarm_name          = "system-status-check-failed-${substr(local.instance_ids[count.index], -8, 8)}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "System status check failed for ${local.instance_ids[count.index]}"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = local.instance_ids[count.index]
  }

  tags = {
    Environment = var.env_name
    InstanceId  = local.instance_ids[count.index]
    AlertType   = "Critical"
  }
}

# Network in alarm (conditional)
resource "aws_cloudwatch_metric_alarm" "high_network_in" {
  count = var.enable_network_monitoring ? local.instance_count : 0

  alarm_name          = "high-network-in-${substr(local.instance_ids[count.index], -8, 8)}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "NetworkIn"
  namespace           = "AWS/EC2"
  period              = var.alarm_period_seconds
  statistic           = "Average"
  threshold           = var.network_in_threshold
  alarm_description   = "High network input traffic for instance ${local.instance_ids[count.index]}"
  alarm_actions       = [aws_sns_topic.warning_alerts.arn]
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceId = local.instance_ids[count.index]
  }

  tags = {
    Environment = var.env_name
    InstanceId  = local.instance_ids[count.index]
    AlertType   = "Warning"
  }
}