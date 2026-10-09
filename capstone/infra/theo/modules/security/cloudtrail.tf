# CloudTrail records every API call made in the account (who did what, and when)
# and writes the log files into the audit bucket.
#
# The lab account already has a trail of its own, so this is a second one. A second
# trail is billed, but at demo volume that is a few cents.

# CloudTrail may only write into the bucket if the bucket says so.
resource "aws_s3_bucket_policy" "audit" {
  bucket = var.audit_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudTrailCheckBucket"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = var.audit_bucket_arn
      },
      {
        Sid       = "CloudTrailWriteLogs"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${var.audit_bucket_arn}/AWSLogs/${var.account_id}/*"
        Condition = { StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" } }
      },
    ]
  })
}

resource "aws_cloudtrail" "main" {
  name           = "${var.project_name}-trail"
  s3_bucket_name = var.audit_bucket_name

  depends_on = [aws_s3_bucket_policy.audit]
}
