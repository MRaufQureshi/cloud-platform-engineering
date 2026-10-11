# modules/landing/outputs.tf

output "cloudfront_url" {
  description = "The address of the landing website"
  value       = "https://${aws_cloudfront_distribution.landing.domain_name}"
}

output "bucket_name" {
  value = aws_s3_bucket.landing.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.landing.id
}
