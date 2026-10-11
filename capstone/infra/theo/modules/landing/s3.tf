# modules/landing/s3.tf
#
# The landing website's files live in a PRIVATE bucket, like the web app's. Only
# CloudFront may read it (see cloudfront.tf). The files themselves are uploaded by
# the T.H.E.O. App Deploy workflow; Terraform only creates the bucket and config.json.

resource "aws_s3_bucket" "landing" {
  bucket        = "${var.project_name}-landing-${var.account_id}"
  force_destroy = true # demo: lets `terraform destroy` empty and delete it
}

resource "aws_s3_bucket_server_side_encryption_configuration" "landing" {
  bucket = aws_s3_bucket.landing.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "landing" {
  bucket                  = aws_s3_bucket.landing.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# config.json: where the Simulator button leads. The web app's CloudFront address is
# new after every rebuild, so Terraform writes it here and the site reads it when it
# loads. no-cache: a browser must never keep an old copy.
resource "aws_s3_object" "config" {
  bucket        = aws_s3_bucket.landing.id
  key           = "config.json"
  content_type  = "application/json"
  cache_control = "no-cache"

  content = jsonencode({
    appUrl = var.app_url
  })
}
