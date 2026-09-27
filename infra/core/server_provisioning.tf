resource "aws_instance" "tf-ec2-public" {
  ami                         = var.ami
  instance_type               = var.instance_type
  ebs_optimized               = true
  availability_zone           = var.az_east_1a
  associate_public_ip_address = true
  subnet_id                   = aws_subnet.e1a-public-subnet.id
  vpc_security_group_ids      = [aws_security_group.allow_ssh_sg.id]
  iam_instance_profile        = aws_iam_instance_profile.tf-cloudwatch_agent_profile.name # Attach the IAM profile to instances
  key_name                    = var.key_pair
  tags = {
    Name        = "${var.instance_name_tag}-bastion-public" # This is important for monitoring discovery!
    Environment = var.env_name
  }

  user_data = <<-EOF
    #!/bin/bash
    sudo dnf update -y
    sudo dnf install -y amazon-cloudwatch-agent
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:${aws_ssm_parameter.cw_agent_config.name}
  EOF

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "tf-ec2-private" {
  ami               = var.ami
  instance_type     = var.instance_type
  ebs_optimized     = true
  availability_zone = var.az_east_1a
  subnet_id         = aws_subnet.e1a-private-subnet.id
  # allow_ssh_sg is attached too — it carries the "SSH from my IP" rule the
  # EIC Endpoint path needs (see security_groups.tf).
  vpc_security_group_ids = [aws_security_group.private_instance_sg.id, aws_security_group.allow_ssh_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.tf-cloudwatch_agent_profile.name
  key_name               = var.key_pair
  tags = {
    Name        = "${var.instance_name_tag}-db-private" # This is important for monitoring discovery!
    Environment = var.env_name
  }

  user_data = <<-EOF
    #!/bin/bash
    sudo dnf update -y
    sudo dnf install -y amazon-cloudwatch-agent
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c ssm:${aws_ssm_parameter.cw_agent_config.name}
  EOF
}

# CloudWatch Agent config, delivered via SSM Parameter Store instead of baking
# it into user_data. Named with the "AmazonCloudWatch-" prefix because the CloudWatchAgentServerPolicy 
# already attached in iam.tf grants ssm:GetParameter for exactly that name pattern.
resource "aws_ssm_parameter" "cw_agent_config" {
  name = "AmazonCloudWatch-linux-instance-config"
  type = "String"
  value = jsonencode({
    metrics = {
      namespace = "CWAgent"
      append_dimensions = {
        InstanceId = "$${aws:InstanceId}"
      }
      metrics_collected = {
        mem = {
          measurement = ["mem_used_percent"]
        }
        disk = {
          measurement = ["disk_used_percent"]
          resources   = ["/"]
        }
      }
    }
  })
}