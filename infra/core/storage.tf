# Who am I? Used only to suffix the bucket names below, so the same code can be
# applied in any account without a name collision.
data "aws_caller_identity" "current" {}

# Create Simple Storage Service (S3) - For Cloud Trail Logs
resource "aws_s3_bucket" "cloudtrail-s3bucket" {
  # Suffixed with the account ID because S3 bucket names are global. Without it
  # "us-east-1a-cloudtrail" is a name anyone could already own, and apply fails
  # with BucketAlreadyExists in someone else's account.
  bucket        = "${var.az_east_1a}-cloudtrail-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags = {
    Name        = "Cloud Trail Logs Bucket" # ← This is a tag for meta data - Friendly name to identify the bucket
    Environment = var.env_name              # ← Another tag (you could add this for Cost Tracking)

    # Find all costs for "staging" resources
    # aws ce get-cost-and-usage --filter "Tags=Staging"
  }
}

# Enable ACLs before setting them
resource "aws_s3_bucket_ownership_controls" "cloudtrail-s3bucket-ownership" {
  bucket = aws_s3_bucket.cloudtrail-s3bucket.id
  rule {
    object_ownership = "BucketOwnerPreferred" # This enables ACLs
  }
}

# Add this new resource for bucket ACL
resource "aws_s3_bucket_acl" "cloudtrail-s3bucket-acl" {
  depends_on = [aws_s3_bucket_ownership_controls.cloudtrail-s3bucket-ownership]
  bucket     = aws_s3_bucket.cloudtrail-s3bucket.id
  acl        = "private" # Sets the bucket to private
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "cloudtrail-s3bucket" {
  bucket = aws_s3_bucket.cloudtrail-s3bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable server-side encryption (SSE-S3)
resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail-s3bucket" {
  bucket = aws_s3_bucket.cloudtrail-s3bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Create Simple Storage Service (S3) - For Hosting Website
resource "aws_s3_bucket" "web-hosting-bucket" {
  # Account-suffixed for the same reason as the CloudTrail bucket above.
  bucket        = "${var.az_east_1a}-web-hosting-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
  tags = {
    Name        = "My S3 web hosting bucket" # ← This is a tag for meta data - Friendly name to identify the bucket
    Environment = var.env_name               # ← Another tag (you could add this for Cost Tracking)

    # Find all costs for "staging" resources
    # aws ce get-cost-and-usage --filter "Tags=Staging"
  }
}

# Static website hosting config: which file to serve for "/" and for errors
resource "aws_s3_bucket_website_configuration" "web-hosting-bucket" {
  bucket = aws_s3_bucket.web-hosting-bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "error.html"
  }
}

# Website buckets are read via public HTTP, not ACLs — keep ACLs disabled
resource "aws_s3_bucket_ownership_controls" "web-hosting-bucket" {
  bucket = aws_s3_bucket.web-hosting-bucket.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Allow the bucket policy below to grant public read access
resource "aws_s3_bucket_public_access_block" "web-hosting-bucket" {
  bucket = aws_s3_bucket.web-hosting-bucket.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

# Public read access to objects, required for website visitors to load pages
resource "aws_s3_bucket_policy" "web-hosting-bucket" {
  bucket     = aws_s3_bucket.web-hosting-bucket.id
  depends_on = [aws_s3_bucket_public_access_block.web-hosting-bucket]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web-hosting-bucket.arn}/*"
      }
    ]
  })
}

# Upload the site's index page; etag triggers re-upload whenever the local file changes
resource "aws_s3_object" "index" {
  bucket       = aws_s3_bucket.web-hosting-bucket.id
  key          = "index.html"
  source       = "${path.module}/web/index.html"
  etag         = filemd5("${path.module}/web/index.html")
  content_type = "text/html"
}