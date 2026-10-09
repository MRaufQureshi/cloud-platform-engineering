# modules/data/variables.tf

variable "project_name" {
  description = "Name prefix for every table and bucket"
  type        = string
}

variable "account_id" {
  description = "AWS account ID, appended to bucket names to make them globally unique"
  type        = string
}
