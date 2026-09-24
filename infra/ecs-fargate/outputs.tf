# ============================================
# OUTPUTS
# These are the values CI and you need after an apply. Everything else stays
# internal to the stack.
# ============================================

# The only public address. Task IPs behind it change constantly; this does not.
output "alb_url" {
  description = "Public URL of the service"
  value       = "http://${aws_lb.main.dns_name}"
}

# What you docker tag/push against, and what cd.yml builds its image URI from.
output "ecr_repository_url" {
  description = "ECR repository URI for docker push"
  value       = aws_ecr_repository.main.repository_url
}

# The three names cd.yml needs in its env: block.
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.main.name
}

output "ecs_task_family" {
  description = "Task definition family - CI registers new revisions under it"
  value       = aws_ecs_task_definition.main.family
}

output "cloudwatch_log_group" {
  description = "Where container logs land"
  value       = aws_cloudwatch_log_group.main.name
}
