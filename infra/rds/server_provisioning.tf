#Use a data source to look up the latest Amazon Linux 2023 AMI 
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "ec2-aurora-host" {
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  ebs_optimized               = true
  associate_public_ip_address = true
  subnet_id                   = data.terraform_remote_state.root.outputs.public_subnet_id_e1b
  # allow_ssh_sg (from root) carries the "SSH from my IP" rule; ec2_host_sg
  # (also from root) is egress-only.
  vpc_security_group_ids = [data.terraform_remote_state.root.outputs.ec2_host_sg_id, data.terraform_remote_state.root.outputs.allow_ssh_sg_id]
  iam_instance_profile   = aws_iam_instance_profile.aurora_agent_profile.name # Attach the IAM profile to instances
  key_name               = var.key_pair

  tags = {
    Name = "ec2-aurora-host"
  }

  user_data = <<-EOF
    #!/bin/bash
    sudo dnf update -y
    sudo dnf install -y mariadb105
  EOF

  lifecycle {
    create_before_destroy = true
  }
}