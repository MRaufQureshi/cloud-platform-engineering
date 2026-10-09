# modules/iot/outputs.tf

output "iot_endpoint" {
  description = "The endpoint devices (and the optimizer) publish to"
  value       = data.aws_iot_endpoint.data.endpoint_address
}

output "device_ids" {
  value = var.device_ids
}

# Sensitive: contains private keys. Terraform hides it from plan output, though
# it is still stored (encrypted bucket) in state.
output "certificates" {
  description = "Per-device certificate and private key (PEM)"
  sensitive   = true
  value = {
    for id, cert in aws_iot_certificate.device : id => {
      certificate_pem = cert.certificate_pem
      private_key     = cert.private_key
    }
  }
}

output "rule_error_log_group" {
  value = aws_cloudwatch_log_group.rule_errors.name
}

output "telemetry_rule_name" {
  value = aws_iot_topic_rule.telemetry.name
}
