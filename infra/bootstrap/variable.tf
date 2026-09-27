# bootstrap/variables.tf
variable "region" {
  description = "AWS region for the state bucket and lock table"
  type        = string
  default     = "us-east-1"
}

# Terraform prompts for it. Whatever you answer must be repeated in every other
# stack's backend.*.hcl file.
variable "bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state"
  type        = string
}

variable "lock_table_name" {
  description = "DynamoDB table name for state locking"
  type        = string
}
