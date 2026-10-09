# modules/iot/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "device_ids" {
  description = "The virtual devices to register as IoT things"
  type        = list(string)
  default     = ["device-1", "device-2", "device-3"]
}

variable "telemetry_table_name" {
  description = "DynamoDB table that receives raw telemetry (Rule A)"
  type        = string
}

variable "telemetry_table_arn" {
  type = string
}

variable "device_state_table_name" {
  description = "DynamoDB table holding each device's latest state (Rule A2)"
  type        = string
}

variable "device_state_table_arn" {
  type = string
}

variable "replan_queue_arn" {
  description = "SQS queue that Rule B sends plug events to (from the optimizer module)"
  type        = string
}

variable "replan_queue_url" {
  type = string
}
