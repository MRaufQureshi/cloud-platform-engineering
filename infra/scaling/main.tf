terraform {
  # PARTIAL BACKEND CONFIGURATION — `bucket` supplied at init time:
  #     terraform init -backend-config=backend.lab.hcl
  # A backend block is parsed before variables exist, so it cannot use var.*.
  backend "s3" {
    key    = "scaling/terraform.tfstate" # Needs its own key, separate from main state
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

# Read-only view into core's state — this stack uses core's VPC and security
# groups without owning them. Unlike the backend block above, a data source is
# evaluated after variables load, so var.* works here.
data "terraform_remote_state" "root" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "core/terraform.tfstate"
    region = var.region
  }
}