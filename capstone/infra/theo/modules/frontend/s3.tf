# modules/frontend/s3.tf
#
# The web app's files live in a PRIVATE bucket. Nobody can read it directly: only
# CloudFront may (see the bucket policy in cloudfront.tf).

resource "aws_s3_bucket" "site" {
  bucket        = "${var.project_name}-site-${var.account_id}"
  force_destroy = true # demo: lets `terraform destroy` empty and delete it
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# config.json: where the app finds the API and the login pool. Terraform writes it,
# because only Terraform knows these values (they are new after every lab wipe).
# The app downloads it when it starts, so the same build works after any rebuild.
# no-cache: a browser must never keep an old copy.
resource "aws_s3_object" "config" {
  bucket        = aws_s3_bucket.site.id
  key           = "config.json"
  content_type  = "application/json"
  cache_control = "no-cache"

  content = jsonencode({
    apiUrl           = var.api_url
    region           = var.region
    userPoolId       = var.user_pool_id
    userPoolClientId = var.user_pool_client_id
    devices          = var.device_ids
  })
}
