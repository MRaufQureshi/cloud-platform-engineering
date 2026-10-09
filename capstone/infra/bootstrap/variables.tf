# capstone/infra/bootstrap/variables.tf

variable "region" {
  description = "AWS region for the state bucket"
  type        = string
  default     = "us-east-1"
}

variable "aws_account_id" {
  description = "AWS account this stack is allowed to build in (the lab account)"
  type        = string
  default     = "464447071956"
}

# Leave null to get theo-tfstate-<account-id>-<region>.
variable "bucket_name" {
  description = "Override the state bucket name (must be globally unique)"
  type        = string
  default     = null
}
