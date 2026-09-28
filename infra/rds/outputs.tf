# =======================
# AURORA CLUSTER ENDPOINT
# =======================

output "aurora_writer_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = aws_rds_cluster.aurora.endpoint
}