# capstone/infra/prerequisites/variables.tf

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

# Enforced by allowed_account_ids in main.tf.
#   464447071956  lab/sandbox (auto-wiped) - THEO builds here
variable "aws_account_id" {
  description = "AWS account this stack is allowed to build in"
  type        = string
  default     = "464447071956"
}

# The four values below make up the OIDC "sub" claim GitHub sends. They are the
# same numbers PREREQUISITES.md explains. Find yours with:
#   curl -s https://api.github.com/repos/<org>/<repo> | grep -E '"id"|"login"'
variable "github_org" {
  description = "GitHub account that owns the repository"
  type        = string
  default     = "MRaufQureshi"
}

variable "github_org_id" {
  description = "Numeric GitHub account ID (immutable)"
  type        = string
  default     = "65447872"
}

variable "github_repo" {
  description = "Repository name"
  type        = string
  default     = "cloud-platform-engineering"
}

variable "github_repo_id" {
  description = "Numeric repository ID (immutable)"
  type        = string
  default     = "1378650886"
}
