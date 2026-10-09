# modules/simulator/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet for the simulator box (it needs the internet gateway to reach IoT Core)"
  type        = string
}

variable "security_group_id" {
  description = "sim-sg from the network module"
  type        = string
}

variable "data_bucket_name" {
  description = "Bucket the simulator code is uploaded to and pulled from at boot"
  type        = string
}

variable "data_bucket_arn" {
  type = string
}

variable "iot_endpoint" {
  description = "IoT data endpoint the devices connect to"
  type        = string
}

variable "device_ids" {
  description = "Devices to simulate (one certificate each)"
  type        = list(string)
}

variable "certificates" {
  description = "Per-device certificate and private key from the iot module"
  type = map(object({
    certificate_pem = string
    private_key     = string
  }))
  sensitive = true
}

variable "code_dir" {
  description = "Folder holding device.py and requirements.txt"
  type        = string
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "time_scale" {
  description = "Simulated seconds per real second (60 = a day in 24 minutes)"
  type        = number
  default     = 60
}

variable "node_exporter_version" {
  description = "node_exporter release installed for Prometheus"
  type        = string
  default     = "1.8.2"
}
