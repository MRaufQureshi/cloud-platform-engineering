# modules/simulator/main.tf
#
# EC2 #1, "the THEO Box Farm": one small instance running the three virtual
# devices from apps/simulator/device.py.
#
# Delivery chain, nothing baked into an image:
#   Terraform --> S3 (device.py)          --> instance downloads it at boot
#   Terraform --> SSM Parameter Store     --> instance reads its device certs at boot
#   user_data  --> installs Python, node_exporter, starts the systemd services
#
# No SSH key pair exists. You get a shell with SSM Session Manager (see iam.tf).

data "aws_region" "current" {}

# Newest Amazon Linux 2023 AMI, resolved by AWS's own public SSM parameter.
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# --- Simulator code, uploaded by Terraform ---------------------------------
# etag = the file's hash: edit device.py and the next apply re-uploads it.
locals {
  code_files = ["device.py", "requirements.txt"]
}

resource "aws_s3_object" "code" {
  for_each = toset(local.code_files)

  bucket = var.data_bucket_name
  key    = "simulator/${each.key}"
  source = "${var.code_dir}/${each.key}"
  etag   = filemd5("${var.code_dir}/${each.key}")
}

resource "aws_instance" "simulator" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.simulator.name

  # The whole boot script is rendered here. The code hash inside it means a code
  # change changes user_data, which (below) replaces the instance so it re-pulls.
  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    project               = var.project_name
    region                = data.aws_region.current.name
    bucket                = var.data_bucket_name
    iot_endpoint          = var.iot_endpoint
    device_ids            = join(" ", var.device_ids)
    device_ids_csv        = join(",", var.device_ids)
    time_scale            = var.time_scale
    node_exporter_version = var.node_exporter_version
    code_hash             = md5(join("", [for o in aws_s3_object.code : o.etag]))
  })
  user_data_replace_on_change = true

  # IMDSv2 only: blocks the classic SSRF trick of stealing instance credentials
  # through a plain GET to the metadata address.
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_size = 8
    encrypted   = true
  }

  tags = { Name = "${var.project_name}-simulator" }

  # AWS publishes a new "latest" AMI every few weeks. Without this, the next
  # apply after a new release would silently destroy and rebuild the instance.
  lifecycle {
    ignore_changes = [ami]
  }

  # The code and certificates must exist before the instance boots and looks for them.
  depends_on = [
    aws_s3_object.code,
    aws_ssm_parameter.certificate,
    aws_ssm_parameter.private_key,
  ]
}
