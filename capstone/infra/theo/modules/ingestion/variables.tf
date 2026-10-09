# modules/ingestion/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "code_dir" {
  description = "Folder holding the Lambda sources (price_fetcher/, forecast/)"
  type        = string
}

variable "prices_table_name" {
  type = string
}

variable "prices_table_arn" {
  type = string
}

variable "data_bucket_name" {
  description = "Raw aWATTar answers are stored here under prices/"
  type        = string
}

variable "data_bucket_arn" {
  type = string
}

variable "replan_queue_url" {
  type = string
}

variable "replan_queue_arn" {
  type = string
}

variable "device_ids" {
  description = "Devices that are asked to re-plan when new prices arrive"
  type        = list(string)
}

variable "schedule" {
  description = "When the price fetcher runs (EventBridge cron, UTC). The day-ahead market publishes ~13:00 UTC."
  type        = string
  default     = "cron(5 13 * * ? *)"
}
