# modules/optimizer/outputs.tf

output "replan_queue_arn" {
  value = aws_sqs_queue.replan.arn
}

output "replan_queue_url" {
  value = aws_sqs_queue.replan.url
}

output "dlq_arn" {
  value = aws_sqs_queue.dlq.arn
}

output "dlq_name" {
  value = aws_sqs_queue.dlq.name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.optimizer.repository_url
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.optimizer.name
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.optimizer.name
}

output "replan_queue_name" {
  value = aws_sqs_queue.replan.name
}
