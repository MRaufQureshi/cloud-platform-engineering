# capstone/infra/bootstrap/main.tf
#
# STEP 2 of 3. Creates the S3 bucket THEO's Terraform state lives in.
#
# Why local state here: this stack creates the place remote state will live, so
# it cannot store its own state there (chicken and egg). Same pattern as
# infra/bootstrap.
#
# Difference from infra/bootstrap: no DynamoDB lock table. Terraform >= 1.10
# locks with a small object in the bucket itself (`use_lockfile = true`), one
# less resource to create, pay for and forget about.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "theo"
      Stack     = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  # S3 bucket names are global across all AWS accounts, so the account ID makes
  # a collision practically impossible without asking you to invent a name.
  bucket_name = coalesce(var.bucket_name, "theo-tfstate-${data.aws_caller_identity.current.account_id}-${var.region}")
}

resource "aws_s3_bucket" "tf_state" {
  bucket        = local.bucket_name
  force_destroy = true # lab account: lets `terraform destroy` empty and delete it
}

# Versioning = every state file revision is kept. A corrupted state can be rolled back.
resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# State files can contain secrets. Never public, no matter what.
resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
