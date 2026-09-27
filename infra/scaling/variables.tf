# Same bucket you gave infra/bootstrap. Put it in terraform.tfvars.
variable "state_bucket" {
  description = "S3 bucket holding core's state"
  type        = string
}

# A golden AMI you bake yourself — see BAKE-AMI.md.
# AMI IDs are account- and region-specific, so nobody else's works.
variable "ami_id" {
  description = "Custom AMI with the web server pre-installed"
  type        = string
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
  description = "Instance type for the scaling host and the ASG"
  type        = string
  default     = "t3.micro"
}
