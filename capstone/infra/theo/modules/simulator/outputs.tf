# modules/simulator/outputs.tf

output "instance_id" {
  description = "Open a shell with: aws ssm start-session --target <this>"
  value       = aws_instance.simulator.id
}

output "private_ip" {
  description = "Prometheus scrapes :9100 and :8000 here (Phase 7)"
  value       = aws_instance.simulator.private_ip
}
