terraform {
  # PARTIAL BACKEND CONFIGURATION — `bucket` supplied at init time:
  #     terraform init -backend-config=backend.lab.hcl
  # A backend block is parsed before variables exist, so it cannot use var.*.
  backend "s3" {
    key    = "rds/terraform.tfstate" # Needs its own key, separate from core's state
    region = "us-east-1"
    # dynamodb_table = "terraform-state-locks"
    use_lockfile = true
    encrypt      = true
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}


# Read-only view into core's state, so this stack can use core's VPC/subnets
# without owning or recreating them. Needs s3:GetObject on core's state key.
#
# Note the asymmetry with the backend block above: this is a DATA SOURCE, not a
# backend, so it is evaluated after variables are loaded and var.* works here.
data "terraform_remote_state" "root" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "core/terraform.tfstate"
    region = var.region
  }
}
