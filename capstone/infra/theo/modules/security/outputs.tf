output "grafana_secret_arn" {
  value = aws_secretsmanager_secret.grafana.arn
}

output "grafana_secret_name" {
  value = aws_secretsmanager_secret.grafana.name
}
