# ============================================
# INPUT VARIABLES — ecs-fargate stack
# ============================================

# General Variables
variable "region" {
  description = "Default region for provider"
  type        = string
  default     = "us-east-1"
}

# Enforced by allowed_account_ids in provider.tf, so applying with the wrong
# credentials pasted in fails at plan time instead of building a second stack
# in the wrong place. Change this if you are using this repo as a template.
#   891105708394  personal (permanent)     - this stack
#   464447071956  lab/sandbox (auto-wiped) - core, scaling, rds
variable "aws_account_id" {
  description = "AWS account this stack is allowed to build in"
  type        = string
  default     = "891105708394"
}

variable "project" {
  description = "Name prefix for every resource, and the ECR repository name"
  type        = string
  default     = "myapp"
}

# Networking Variables
variable "vpc_cidr" {
  description = "How big is your VPC CIDR block? 65536 in total"
  type        = string
  default     = "10.0.0.0/16"
}

# Two AZs minimum — an ALB will not create with subnets in only one.
variable "azs" {
  description = "Availability zones to spread the public subnets across"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.azs) >= 2
    error_message = "An Application Load Balancer requires at least two AZs."
  }
}

# Application Variables
# Must match PORT in apps/node-ecs-service/server.js. Used three times: the
# container port mapping, the task security group ingress, and the target group.
variable "container_port" {
  description = "Port the Node process listens on inside the container"
  type        = number
  default     = 3000
}

variable "desired_count" {
  description = "How many Fargate tasks the service keeps running"
  type        = number
  default     = 2
}

# "bootstrap" is a placeholder for the first apply: Terraform creates an EMPTY
# ECR repository, then registers a task definition pointing into it. No image
# exists yet, so the first deploy of a real tag comes from CI.
# Never :latest — a mutable tag has no address to roll back TO.
variable "image_tag" {
  description = "Image tag the task definition points at"
  type        = string
  default     = "bootstrap"
}

variable "health_check_path" {
  description = "Path the ALB polls — 200 is healthy, anything else kills the task"
  type        = string
  default     = "/health"
}

# Task Sizing Variables
# CPU and memory are not free-form: they must form a valid PAIR or
# RegisterTaskDefinition is rejected. 256 CPU allows 512/1024/2048 MiB.
variable "task_cpu" {
  description = "Fargate CPU units for the task, where 1024 = 1 vCPU"
  type        = number
  default     = 256
}

variable "task_memory" {
  description = "Fargate memory in MiB — must be a valid pairing with task_cpu"
  type        = number
  default     = 512
}

# A log group created outside Terraform defaults to "never expire", which bills
# forever — the one ECS cost that keeps growing quietly after a teardown.
variable "log_retention_days" {
  description = "How long CloudWatch keeps the container logs"
  type        = number
  default     = 7
}
