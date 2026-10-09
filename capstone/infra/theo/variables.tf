# ============================================
# INPUT VARIABLES — theo stack
# ============================================
# Variables are added in the phase that first needs them, so every variable
# here is one you can see being used.

variable "region" {
  description = "Default region for provider"
  type        = string
  default     = "us-east-1"
}

# Enforced by allowed_account_ids in provider.tf.
#   464447071956  lab/sandbox (auto-wiped) - THEO builds here
#   891105708394  personal (permanent)     - ecs-fargate, NOT this stack
variable "aws_account_id" {
  description = "AWS account this stack is allowed to build in"
  type        = string
  default     = "464447071956"
}

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
  default     = "theo"
}

# Phase 1. Only this address may open Grafana (:3000). It changes whenever your
# ISP rotates it, so check it before each apply:
#     curl -s https://checkip.amazonaws.com
# Local runs read it from terraform.tfvars (gitignored); CI reads the MY_IP
# repo SECRET (a secret, not a Variable: the repository is public).
variable "my_ip" {
  description = "Your current public IPv4 address, e.g. 203.0.113.7 (no /32)"
  type        = string

  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}$", var.my_ip))
    error_message = "my_ip must be a plain IPv4 address like 203.0.113.7 (no /32, no spaces)."
  }
}

# Phase 7. Alarm emails go here. Local runs read it from terraform.tfvars (gitignored);
# CI reads the ALERT_EMAIL repo secret (the repository is public).
variable "alert_email" {
  description = "Email address for the alarm notifications"
  type        = string
}
