# modules/api/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "code_dir" {
  description = "Folder holding the Lambda sources (api_handler/)"
  type        = string
}

variable "table_names" {
  description = "DynamoDB table names by short name (from the data module)"
  type        = map(string)
}

variable "table_arns" {
  description = "DynamoDB table ARNs by short name (from the data module)"
  type        = map(string)
}

variable "replan_queue_url" {
  type = string
}

variable "replan_queue_arn" {
  type = string
}

variable "iot_endpoint" {
  description = "IoT data endpoint the Lambda publishes plug commands to"
  type        = string
}

variable "device_ids" {
  description = "The only device IDs the API will accept"
  type        = list(string)
}

variable "region" {
  type = string
}

variable "allowed_origins" {
  description = "Browser origins allowed to call the API (CORS). Phase 6 adds the CloudFront address."
  type        = list(string)
}

variable "demo_username" {
  description = "The one test user (an email address, because the pool signs in by email)"
  type        = string
  default     = "admin@theo.demo"
}
