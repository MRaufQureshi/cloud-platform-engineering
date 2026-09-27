terraform {
  # PARTIAL BACKEND CONFIGURATION.
  #
  # `bucket` is deliberately absent. A backend block is parsed before variables
  # exist, so it cannot use var.* — which is why a bucket name normally ends up
  # hardcoded, and why this repo would otherwise be welded to one AWS account.
  # The missing value is supplied at init time instead:
  #
  #     terraform init -backend-config=backend.lab.hcl
  #
  # Same code, any account. See backend.lab.hcl in this directory.
  backend "s3" {
    key    = "core/terraform.tfstate"
    region = "us-east-1"
    # dynamodb_table = "terraform-state-locks"   # superseded by use_lockfile
    use_lockfile = true # S3-native state locking (Terraform >= 1.10)
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
  region = "us-east-1"
}

module "monitoring" {
  source = "./monitoring/"

  # Instance IDs are passed directly (rather than rediscovered via a data
  # source) so the module's alarm counts are known at plan time even though
  # the instances are created in this same apply.
  instance_ids = [
    aws_instance.tf-ec2-public.id,
    aws_instance.tf-ec2-private.id,
  ]

  # Pass required variables to the module
  instance_name_tag         = var.instance_name_tag
  env_name                  = var.env_name
  region                    = var.region
  alert_email               = var.alert_email
  cpu_threshold             = var.cpu_threshold
  memory_threshold          = var.memory_threshold
  network_in_threshold      = var.network_in_threshold
  sns_protocol              = var.sns_protocol
  alarm_period_seconds      = var.alarm_period_seconds
  dashboard_name            = var.dashboard_name
  enable_network_monitoring = var.enable_network_monitoring
}

module "security" {
  source = "./security/"
  # Pass required variables to the module
  bucket_id  = aws_s3_bucket.cloudtrail-s3bucket.id
  bucket_arn = aws_s3_bucket.cloudtrail-s3bucket.arn
}