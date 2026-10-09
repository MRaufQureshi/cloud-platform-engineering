variable "project_name" {
  type = string
}

variable "region" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "security_group_id" {
  type = string
}

variable "code_dir" {
  description = "Folder with the Prometheus and Grafana files (apps/observability)"
  type        = string
}

variable "data_bucket_name" {
  type = string
}

variable "data_bucket_arn" {
  type = string
}

variable "simulator_private_ip" {
  type = string
}

variable "cluster_name" {
  type = string
}

variable "service_name" {
  type = string
}

variable "replan_queue_name" {
  type = string
}

variable "dlq_name" {
  type = string
}

variable "telemetry_rule_name" {
  type = string
}

variable "grafana_secret_arn" {
  type = string
}

variable "alert_email" {
  description = "Where the alarm emails go"
  type        = string
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "node_exporter_version" {
  type    = string
  default = "1.8.2"
}

variable "compose_version" {
  type    = string
  default = "2.29.7"
}
