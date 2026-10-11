# modules/landing/variables.tf

variable "project_name" {
  description = "Name prefix for every resource"
  type        = string
}

variable "account_id" {
  description = "Appended to the bucket name so it is globally unique"
  type        = string
}

variable "app_url" {
  description = "The address of the web app: the site's Simulator button opens it"
  type        = string
}
