# modules/network/variables.tf — inputs the root stack passes in.

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "region" {
  description = "Region, used to build VPC endpoint service names"
  type        = string
}

variable "my_ip" {
  description = "Your public IPv4 address. Only this address may reach Grafana (:3000)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC address range (65,536 addresses)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Two availability zones: index 0 gets the NAT gateway"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  description = "One /24 per AZ for the public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "One /24 per AZ for the private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}
