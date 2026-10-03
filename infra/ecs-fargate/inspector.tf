# ==========================================================
# Amazon Inspector — CVE scanning for the images ECS runs
# ==========================================================

# Inspector cannot see inside a running Fargate task: there is no agent and
# nothing to attach one to. What it scans is the IMAGE the task runs, which
# lives in the ECR repository created in ecs.tf.

# 1. Turn Inspector on.
#
# ACCOUNT-WIDE SWITCH, not a property of the repository. It takes account IDs,
# not an ECR ARN, and `terraform destroy` in this stack turns scanning off for
# every repository in the account. That is acceptable here because this account
# holds nothing else, but it is the reason this resource is worth a second look
# before copying it into a shared account.
resource "aws_inspector2_enabler" "ecr" {
  # allowed_account_ids in provider.tf already refuses to run anywhere else,
  # so this variable and the live caller are always the same account.
  account_ids    = [var.aws_account_id]
  resource_types = ["ECR"]
}

# 2. Scan frequency.
#
# Enabling Inspector moves the registry to enhanced scanning on its own.
# Declaring it makes the choice explicit: CONTINUOUS_SCAN re-scans images as new
# CVEs are published, so a finding can appear on an image that has not been
# pushed in months. SCAN_ON_PUSH would only look once.
resource "aws_ecr_registry_scanning_configuration" "main" {
  scan_type = "ENHANCED"

  rule {
    scan_frequency = "CONTINUOUS_SCAN"

    # Registry-wide, not per-repository — this resource configures the whole
    # registry and there is exactly one repository in it.
    repository_filter {
      filter      = "*"
      filter_type = "WILDCARD"
    }
  }

  depends_on = [aws_inspector2_enabler.ecr]
}
