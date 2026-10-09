terraform {
  # 1.10 is the floor because `use_lockfile` (S3-native state locking, no
  # DynamoDB table) only exists from 1.10 onward.
  required_version = ">= 1.10"

  # PARTIAL CONFIGURATION: `bucket` is deliberately absent. A backend block is
  # parsed before variables exist, so it cannot use var.*. It is supplied at init:
  #     terraform init -backend-config=backend.lab.hcl      (local)
  #     terraform init -backend-config="bucket=..."         (CI, from a repo Variable)
  backend "s3" {
    key          = "theo/terraform.tfstate" # own key = own state file
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0" # 5.x minors and patches, never 6.0
    }
  }
}

provider "aws" {
  region = var.region

  # THE GUARD. Credentials from a different account (say, your personal one)
  # make Terraform stop at plan time instead of building THEO in the wrong place:
  #   Error: AWS Account ID not allowed: 891105708394
  allowed_account_ids = [var.aws_account_id]

  # Applied to every taggable resource, so modules never repeat these.
  default_tags {
    tags = {
      Project   = var.project_name
      Stack     = "theo"
      ManagedBy = "terraform"
    }
  }
}
