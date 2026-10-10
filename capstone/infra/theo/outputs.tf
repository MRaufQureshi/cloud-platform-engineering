# capstone/infra/theo/outputs.tf

output "account_id" {
  description = "AWS account Terraform is currently talking to (should be the lab)"
  value       = data.aws_caller_identity.current.account_id
}

output "region" {
  description = "Region everything is built in"
  value       = var.region
}

# --- Phase 1
output "vpc_id" {
  value = module.network.vpc_id
}

output "private_subnet_ids" {
  value = module.network.private_subnet_ids
}

output "nat_public_ip" {
  description = "Everything in the private subnets appears to the internet as this address"
  value       = module.network.nat_public_ip
}

output "table_names" {
  value = module.data.table_names
}

output "data_bucket" {
  value = module.data.data_bucket_name
}

output "audit_bucket" {
  value = module.data.audit_bucket_name
}

# --- Phase 2
output "iot_endpoint" {
  description = "IoT data endpoint (devices and the optimizer publish here)"
  value       = module.iot.iot_endpoint
}

output "simulator_instance_id" {
  description = "Shell: aws ssm start-session --target <this>"
  value       = module.simulator.instance_id
}

# --- Phase 3
output "ecr_repository_url" {
  description = "Push the optimizer image here (T.H.E.O. App Deploy does it)"
  value       = module.optimizer.ecr_repository_url
}

output "replan_queue_url" {
  value = module.optimizer.replan_queue_url
}

output "optimizer_log_group" {
  description = "aws logs tail <this> --follow"
  value       = module.optimizer.log_group_name
}

# --- Phase 4
output "price_fetcher_name" {
  description = "Run it now: aws lambda invoke --function-name <this> /dev/stdout"
  value       = module.ingestion.price_fetcher_name
}

# --- Phase 5
output "api_url" {
  description = "Base URL of the API"
  value       = module.api.api_url
}

output "cognito_user_pool_id" {
  value = module.api.user_pool_id
}

output "cognito_client_id" {
  value = module.api.client_id
}

output "demo_username" {
  value = module.api.demo_username
}

output "demo_temporary_password" {
  description = "terraform output -raw demo_temporary_password"
  value       = module.api.demo_temporary_password
  sensitive   = true
}

# --- Phase 6
output "app_url" {
  description = "Open this in a browser"
  value       = module.frontend.cloudfront_url
}

output "frontend_bucket" {
  value = module.frontend.bucket_name
}

# --- Phase 7
output "grafana_url" {
  description = "Open this in a browser (only your IP can reach it)"
  value       = module.observability.grafana_url
}

output "grafana_secret_name" {
  description = "The Grafana admin password is stored under this name in Secrets Manager"
  value       = module.security.grafana_secret_name
}
