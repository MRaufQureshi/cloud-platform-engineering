# modules/data/s3.tf
#
# Two private buckets.
#   data  : holds the simulator code (the EC2 box downloads it at boot) and the
#           raw aWATTar price JSON the price Lambda saves.
#   audit : receives CloudTrail logs (the trail itself arrives in Phase 7).
#
# Every bucket is encrypted, fully blocks public access, and has force_destroy
# so `terraform destroy` can empty and remove it. That is the demo trade-off; in
# production you would NOT set force_destroy on an audit bucket.
#
# Bucket names are global across every AWS account, so the account ID is part of
# the name.

locals {
  buckets = {
    data  = "${var.project_name}-data-${var.account_id}"
    audit = "${var.project_name}-audit-${var.account_id}"
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets

  bucket        = each.value
  force_destroy = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = aws_s3_bucket.this

  bucket = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each = aws_s3_bucket.this

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning only on the audit bucket: an audit trail you can overwrite is not
# much of an audit trail.
resource "aws_s3_bucket_versioning" "audit" {
  bucket = aws_s3_bucket.this["audit"].id

  versioning_configuration {
    status = "Enabled"
  }
}
