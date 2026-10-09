# modules/frontend/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "account_id" {
  description = "Appended to the bucket name so it is globally unique"
  type        = string
}

# These four end up in config.json, which the web app reads when it starts.
variable "api_url" {
  type = string
}

variable "region" {
  type = string
}

variable "user_pool_id" {
  type = string
}

variable "user_pool_client_id" {
  type = string
}

variable "device_ids" {
  type = list(string)
}
