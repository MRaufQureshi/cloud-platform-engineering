output "public_ip" {
  value = aws_instance.observability.public_ip
}

output "grafana_url" {
  value = "http://${aws_instance.observability.public_ip}:3000"
}

output "instance_id" {
  value = aws_instance.observability.id
}

output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
