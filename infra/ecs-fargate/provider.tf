terraform {
  # Pins the CLI, not the provider. 1.10 is the floor because `use_lockfile`
  # (S3-native state locking, no DynamoDB table) only exists from 1.10 onward.
  required_version = ">= 1.10"

  # State lives in S3, not on a laptop. A GitHub Actions runner is a fresh VM
  # with no local state file, so it would plan to create all 19 resources again.
  #
  # PARTIAL CONFIGURATION: `bucket` is deliberately absent. A backend block is
  # parsed before variables exist, so it cannot use var.* — hardcoding the
  # bucket would weld this repo to one AWS account. Supplied at init instead:
  #     terraform init -backend-config=backend.personal.hcl
  backend "s3" {
    key          = "ecs-fargate/terraform.tfstate" # own key = own state file
    region       = "us-east-1"
    use_lockfile = true # S3-native locking, no DynamoDB table needed
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

  # THE GUARD. Terraform refuses to plan or apply if the credentials currently
  # in ~/.aws/credentials belong to a different account. Since you swap keys by
  # hand rather than using named profiles, this is what stands between a
  # pasted-the-wrong-keys moment and a duplicate stack quietly appearing in the
  # lab account. It fails before a single API call:
  #   Error: AWS Account ID not allowed: 464447071956
  allowed_account_ids = [var.aws_account_id]

  # Applied to every resource in this stack that supports tagging, so nothing
  # below needs its own tags block for these three. Two known gaps: container
  # definitions inside a task definition are opaque JSON to the provider, and
  # CloudWatch log *streams* are created by the ECS agent at runtime rather than
  # by Terraform — neither inherits these.
  default_tags {
    tags = {
      Project   = var.project
      Stack     = "ecs-fargate"
      ManagedBy = "terraform"
    }
  }
}
