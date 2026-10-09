# modules/optimizer/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "region" {
  type = string
}

variable "private_subnet_ids" {
  description = "The task runs here: no public IP, reaches AWS services through VPC endpoints"
  type        = list(string)
}

variable "fargate_sg_id" {
  description = "fargate-sg from the network module"
  type        = string
}

variable "table_names" {
  description = "DynamoDB table names by short name (from the data module)"
  type        = map(string)
}

variable "table_arns" {
  description = "DynamoDB table ARNs by short name (from the data module)"
  type        = map(string)
}

variable "image_tag" {
  description = "Image the task definition starts with. CI deploys new tags (the commit SHA) afterwards."
  type        = string
  default     = "bootstrap"
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}
