# ============================================
# MODULE INPUT VARIABLES
# These variables are passed from the root module
# ============================================

variable "instance_name_tag" {
  description = "Name tag value to filter EC2 instances for monitoring"
  type        = string
  default     = "tf-instance"
}

variable "env_name" {
  description = "Deployment environment (dev/staging/production)"
  type        = string
  default     = "staging"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1a"
}

variable "alert_email" {
  description = "Email address for receiving CloudWatch alerts"
  type        = string
}

variable "cpu_threshold" {
  description = "CPU utilization threshold percentage (0-100)"
  type        = number
  default     = 80
}

variable "memory_threshold" {
  description = "Memory utilization threshold percentage (0-100)"
  type        = number
  default     = 85
}

variable "network_in_threshold" {
  description = "Network input threshold in bytes per second"
  type        = number
  default     = 100000000
}

variable "sns_protocol" {
  description = "SNS subscription protocol (email, sms, etc.)"
  type        = string
  default     = "email"
}

variable "alarm_period_seconds" {
  description = "Period for alarm evaluation in seconds"
  type        = number
  default     = 300
}

variable "dashboard_name" {
  description = "Name for the CloudWatch dashboard"
  type        = string
  default     = "monitoring-dashboard"
}

variable "enable_network_monitoring" {
  description = "Enable network traffic monitoring"
  type        = bool
  default     = false
}

variable "instance_ids" {
  description = "IDs of the EC2 instances to monitor"
  type        = list(string)
}
