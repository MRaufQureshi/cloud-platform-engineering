# Instance list is passed directly from the root module so the count of
# instances is known at plan time, instead of being rediscovered via a
# data source lookup that would depend on resources created in the same apply.

locals {
  instance_count = length(var.instance_ids)
  instance_ids   = var.instance_ids
}

# Validation to ensure instances are found
resource "terraform_data" "validate_instances" {
  count = local.instance_count > 0 ? 0 : 1

  provisioner "local-exec" {
    command = "echo 'Error: No running instances found with name tag: ${var.instance_name_tag}' && exit 1"
  }
}
