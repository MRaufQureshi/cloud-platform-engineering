# Amazon Inspector scans for known vulnerabilities (CVEs). Same idea as
# infra/ecs-fargate/inspector.tf, for three kinds of resource:
#   EC2     the simulator and observability boxes
#   ECR     the optimizer image
#   LAMBDA  the Lambda functions
#
# This is an ACCOUNT-WIDE switch: `terraform destroy` turns Inspector off for
# every resource in the lab account, not only THEO's.
resource "aws_inspector2_enabler" "main" {
  account_ids    = [var.account_id]
  resource_types = ["EC2", "ECR", "LAMBDA"]
}

# Re-scan images continuously, so a new CVE shows up on an image pushed weeks ago.
resource "aws_ecr_registry_scanning_configuration" "main" {
  scan_type = "ENHANCED"

  rule {
    scan_frequency = "CONTINUOUS_SCAN"

    repository_filter {
      filter      = "*"
      filter_type = "WILDCARD"
    }
  }

  depends_on = [aws_inspector2_enabler.main]
}
