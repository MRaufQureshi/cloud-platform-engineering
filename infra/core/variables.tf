#Private Variable
#Always check you current IP address as it gets changed by ISP
variable "my_ip" {
  description = "What is your current public IP from your ISP?:"
  type        = string
}

# General Variables
variable "region" {
  description = "Default region for provider"
  type        = string
  default     = "us-east-1"
}

variable "cidr_block" {
  description = "How big is your VPC CIDR block? 1024 in total"
  type        = string
  default     = "192.168.0.0/22"
}

variable "public_subnet_block_e1a" {
  description = "How big is your Public Subnet Range in us-east-1a? 32"
  type        = string
  default     = "192.168.0.0/27"
}

variable "private_subnet_block_e1a" {
  description = "How big is your Private Subnet Range in us-east-1a? 32"
  type        = string
  default     = "192.168.0.32/27"
}

variable "public_subnet_block_e1b" {
  description = "How big is your Public Subnet Range in us-east-1b? 32"
  type        = string
  default     = "192.168.0.64/27"
}

variable "private_subnet_block_e1b" {
  description = "How big is your Private Subnet Range in us-east-1b? 32"
  type        = string
  default     = "192.168.0.96/27"
}

variable "az_east_1a" {
  description = "Availability zone N.Virginia"
  type        = string
  default     = "us-east-1a"
}

variable "az_east_1b" {
  description = "Availability zone N.Virginia"
  type        = string
  default     = "us-east-1b"
}

variable "tf-sg" {
  description = "This is a placeholder security group created by Terraform"
  type        = string
  default     = "terraform"
}

variable "env_name" {
  description = "Deployment environment (dev/staging/production)"
  type        = string
  default     = "staging"
}

# EC2 Variables
variable "ami" {
  description = "Amazon machine image to use for ec2 instance"
  type        = string
  default     = "ami-02b64aa047cb5edf5" # Ubuntu 20.04 LTS // us-east-1
}

variable "instance_type" {
  description = "ec2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "enable_status_checks" {
  description = "Enable EC2 status check monitoring"
  type        = bool
  default     = true
}

variable "instance_name_tag" {
  description = "Name tag value to filter EC2 instances for monitoring"
  type        = string
  default     = "tf-instance"
}

variable "key_pair" {
  description = "Name of the AWS Key Pair"
  type        = string
  default     = "your-key-pair" # Must exist in your account — see PREREQUISITES.md
}

# # S3 Variable
# variable "bucket_id" {
#   description = "cloud trail s3 bucket ID"
#   type        = string
# }

# variable "bucket_arn" {
#   description = "cloud trail s3 bucket arn"
#   type        = string
# }

# Cloud Watch Monitoring Variable
variable "dashboard_name" {
  description = "Name for the CloudWatch dashboard"
  type        = string
  default     = "monitoring-dashboard"

  validation {
    condition     = can(regex("^[a-zA-Z0-9_-]+$", var.dashboard_name))
    error_message = "Dashboard name can only contain alphanumeric characters, hyphens, and underscores."
  }
}

# Dashboard configuration
variable "dashboard_period_seconds" {
  description = "Default period for dashboard widgets in seconds"
  type        = number
  default     = 300

  validation {
    condition     = contains([60, 300, 900, 3600, 21600, 86400], var.dashboard_period_seconds)
    error_message = "Dashboard period must be one of: 60, 300, 900, 3600, 21600, 86400 seconds."
  }
}

# Change Email Address
variable "alert_email" {
  description = "Email address for receiving CloudWatch alerts"
  type        = string
  default     = "temp_email@temp.email.com" # Change this value on runtime

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.alert_email))
    error_message = "Alert email must be a valid email address."
  }
}

# Alarm Threshold Variables
variable "cpu_threshold" {
  description = "CPU utilization threshold percentage (0-100)"
  type        = number
  default     = 80

  validation {
    condition     = var.cpu_threshold >= 0 && var.cpu_threshold <= 100
    error_message = "CPU threshold must be between 0 and 100."
  }
}

# Memory Threshold Variables
variable "memory_threshold" {
  description = "Memory utilization threshold percentage (0-100)"
  type        = number
  default     = 85

  validation {
    condition     = var.memory_threshold >= 0 && var.memory_threshold <= 100
    error_message = "Memory threshold must be between 0 and 100."
  }
}

# Memory Threshold Variables
variable "network_in_threshold" {
  description = "Network input threshold in bytes per second"
  type        = number
  default     = 100000000 # 100MB
}

# SNS Configuration Variable
variable "sns_protocol" {
  description = "SNS subscription protocol (email, sms, etc.)"
  type        = string
  default     = "email"

  validation {
    condition     = contains(["email", "email-json", "sms", "sqs", "application", "lambda", "firehose"], var.sns_protocol)
    error_message = "SNS protocol must be one of: email, email-json, sms, sqs, application, lambda, firehose."
  }
}

# Cost Optimization variable
variable "alarm_period_seconds" {
  description = "Period for alarm evaluation in seconds"
  type        = number
  default     = 300

  validation {
    condition     = contains([60, 300, 900, 3600], var.alarm_period_seconds)
    error_message = "Alarm period must be one of: 60, 300, 900, 3600 seconds."
  }
}

# Network monitor variable
variable "enable_network_monitoring" {
  description = "Enable network traffic monitoring"
  type        = bool
  default     = false
}