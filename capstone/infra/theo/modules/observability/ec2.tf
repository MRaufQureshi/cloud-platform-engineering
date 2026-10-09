# EC2 #2: runs Prometheus and Grafana in Docker. Same delivery idea as the simulator:
# Terraform puts the config files in S3, the boot script downloads them.

data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

locals {
  config_files = [
    "docker-compose.yml",
    "find-optimizer.sh",
    "grafana/datasources.yml",
    "grafana/dashboards.yml",
    "grafana/theo-dashboard.json",
  ]
}

resource "aws_s3_object" "config" {
  for_each = toset(local.config_files)

  bucket = var.data_bucket_name
  key    = "observability/${each.key}"
  source = "${var.code_dir}/${each.key}"
  etag   = filemd5("${var.code_dir}/${each.key}")
}

# prometheus.yml needs the simulator's address, so Terraform fills it in first.
resource "aws_s3_object" "prometheus" {
  bucket  = var.data_bucket_name
  key     = "observability/prometheus.yml"
  content = templatefile("${var.code_dir}/prometheus.yml.tpl", { simulator_ip = var.simulator_private_ip })
}

resource "aws_instance" "observability" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = aws_iam_instance_profile.observability.name

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    region                = var.region
    bucket                = var.data_bucket_name
    secret_id             = var.grafana_secret_arn
    cluster               = var.cluster_name
    service               = var.service_name
    node_exporter_version = var.node_exporter_version
    compose_version       = var.compose_version
    config_hash           = md5(join("", [for o in aws_s3_object.config : o.etag], [aws_s3_object.prometheus.etag]))
  })
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    volume_size = 12
    encrypted   = true
  }

  tags = { Name = "${var.project_name}-observability" }

  lifecycle {
    ignore_changes = [ami]
  }

  depends_on = [aws_s3_object.config, aws_s3_object.prometheus]
}
