# Same bucket you gave infra/bootstrap. Put it in terraform.tfvars.
variable "state_bucket" {
  description = "S3 bucket holding core's state"
  type        = string
}

# No default, and never committed. Put it in terraform.tfvars, which is
# gitignored, or export TF_VAR_db_master_password.
variable "db_master_password" {
  description = "Aurora master password"
  type        = string
  sensitive   = true
}

variable "db_master_username" {
  description = "Aurora master username"
  type        = string
  default     = "admin"
}

variable "db_name" {
  description = "Database created inside the cluster"
  type        = string
  default     = "pantheon"
}

variable "engine_version" {
  description = "Aurora MySQL engine version"
  type        = string
  default     = "8.0.mysql_aurora.3.10.3"
}

variable "db_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "key_pair" {
  description = "AWS key pair name, from PREREQUISITES.md"
  type        = string
  default     = "your-key-pair"
}

variable "region" {
  description = "Must match the region core's VPC is in"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "Instance type for the Aurora client host"
  type        = string
  default     = "t3.micro"
}
