# The Grafana admin password lives in Secrets Manager, not in git or in the boot
# script. Terraform makes up a random one; the observability box reads it at boot.
resource "random_password" "grafana" {
  length  = 20
  special = false # letters and numbers only, so it is safe in a config file
}

resource "aws_secretsmanager_secret" "grafana" {
  name                    = "${var.project_name}/grafana-admin-password"
  recovery_window_in_days = 0 # delete at once on destroy, so a rebuild can reuse the name
}

resource "aws_secretsmanager_secret_version" "grafana" {
  secret_id     = aws_secretsmanager_secret.grafana.id
  secret_string = random_password.grafana.result
}
