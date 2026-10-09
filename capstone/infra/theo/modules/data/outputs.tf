# modules/data/outputs.tf — maps keyed by short name, e.g. table_names["prices"].

output "table_names" {
  value = { for k, t in aws_dynamodb_table.this : k => t.name }
}

output "table_arns" {
  value = { for k, t in aws_dynamodb_table.this : k => t.arn }
}

output "data_bucket_name" {
  value = aws_s3_bucket.this["data"].bucket
}

output "data_bucket_arn" {
  value = aws_s3_bucket.this["data"].arn
}

output "audit_bucket_name" {
  value = aws_s3_bucket.this["audit"].bucket
}

output "audit_bucket_arn" {
  value = aws_s3_bucket.this["audit"].arn
}
