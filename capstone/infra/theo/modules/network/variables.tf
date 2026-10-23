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

# Sized to fit the project. Each subnet is a /27: 32 addresses
variable "vpc_cidr" {
  description = "VPC address range (256 addresses)"
  type        = string
  default     = "10.0.0.0/24"
}

variable "azs" {
  description = "Two availability zones: index 0 gets the NAT gateway"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "public_subnet_cidrs" {
  description = "One /27 per AZ for the public subnets"
  type        = list(string)
  default     = ["10.0.0.0/27", "10.0.0.32/27"]
}

variable "private_subnet_cidrs" {
  description = "One /27 per AZ for the private subnets"
  type        = list(string)
  default     = ["10.0.0.64/27", "10.0.0.96/27"]
}
