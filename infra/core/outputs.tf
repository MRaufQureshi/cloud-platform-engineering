# ============================================
# Ansible OUTPUTS
# ============================================
output "instance_details" {
  value = {
    public_ip           = aws_instance.tf-ec2-public.public_ip
    private_ip          = aws_instance.tf-ec2-private.private_ip
    public_instance_id  = aws_instance.tf-ec2-public.id
    private_instance_id = aws_instance.tf-ec2-private.id
  }
}

# ============================================
# SSM OUTPUTS
# ============================================

output "ec2_public_url" {
  description = "URL to access the public server"
  value       = "http://${aws_instance.tf-ec2-public.public_ip}"
}

# -------------------------------------------
# EC2 Instance Connect Endpoint
# -------------------------------------------

# output "eic_endpoint_id" {
#   description = "EC2 Instance Connect Endpoint ID"
#   value       = aws_ec2_instance_connect_endpoint.eic_endpoint.id
# }

# output "eic_endpoint_dns" {
#   description = "EC2 Instance Connect Endpoint DNS Name"
#   value       = aws_ec2_instance_connect_endpoint.eic_endpoint.dns_name
# }

# output "eic_security_group_id" {
#   description = "Security Group ID of the EIC Endpoint"
#   value       = aws_security_group.eic_endpoint_sg.id
# }

# -------------------------------------------
# Monitoring module
# -------------------------------------------

# output "monitored_instances" {
#   description = "Information about monitored instances"
#   value       = module.monitoring.monitored_instances
# }

output "monitoring_dashboard_url" {
  description = "URL for the CloudWatch dashboard"
  value       = module.monitoring.dashboard_url
}

# output "monitoring_sns_topic_arns" {
#   description = "ARNs of the SNS topics"
#   value       = module.monitoring.sns_topic_arns
# }

# output "monitoring_alarm_count" {
#   description = "Total number of alarms created"
#   value       = module.monitoring.alarm_count
# }

# -------------------------
# Static website hosting
# -------------------------

output "website_endpoint" {
  description = "S3 static website endpoint URL"
  value       = "http://${aws_s3_bucket_website_configuration.web-hosting-bucket.website_endpoint}"
}

# -------------------------------------------
# Network outputs consumed by other projects (e.g. rds/, scaling/)
# via terraform_remote_state. Root owns the VPC/subnets/route
# tables; other projects only ever read these IDs, never
# create their own subnets, to keep CIDR planning centralized.
# -------------------------------------------

output "vpc_id" {
  description = "ID of the shared VPC"
  value       = aws_vpc.tf_vpc.id
}

output "public_subnet_id_e1a" {
  description = "ID of the public subnet in us-east-1a"
  value       = aws_subnet.e1a-public-subnet.id
}

output "private_subnet_id_e1a" {
  description = "ID of the private subnet in us-east-1a"
  value       = aws_subnet.e1a-private-subnet.id
}

output "public_subnet_id_e1b" {
  description = "ID of the public subnet in us-east-1b"
  value       = aws_subnet.e1b-public-subnet.id
}

output "private_subnet_id_e1b" {
  description = "ID of the private subnet in us-east-1b"
  value       = aws_subnet.e1b-private-subnet.id
}

output "allow_ssh_sg_id" {
  description = "ID of the shared allow-SSH-from-my-IP security group"
  value       = aws_security_group.allow_ssh_sg.id
}

output "aurora_sg_id" {
  description = "ID of the Aurora security group"
  value       = aws_security_group.aurora_sg.id
}

output "ec2_host_sg_id" {
  description = "ID of the EC2 host security group"
  value       = aws_security_group.ec2_host_sg.id
}

output "private_instance_sg_id" {
  description = "ID of the Private security group (SSH/HTTP/HTTPS)"
  value       = aws_security_group.private_instance_sg.id
}