# Create Security Group for Public Instance level - SSH Only
resource "aws_security_group" "allow_ssh_sg" {
  name        = "${var.tf-sg}-allow-ssh-sg"
  description = "Allow SSH inbound traffic and all outbound traffic"
  vpc_id      = aws_vpc.tf_vpc.id
  tags = {
    Name = "${var.tf-sg}-allow-ssh"
  }
}

# Add a specific inbound "door" to public instance - Inbound Traffic
resource "aws_vpc_security_group_ingress_rule" "allow_ssh_ipv4" {
  # The security group you want the rule applied to
  security_group_id = aws_security_group.allow_ssh_sg.id
  # Helpful description (optional but recommended)
  description = "Allow SSH from the internet with MY IP ONLY"
  # Only Allow *MY* IPv4 address from the Internet
  cidr_ipv4 = var.my_ip
  # SSH port
  from_port   = 22
  to_port     = 22
  ip_protocol = "tcp"
  tags = {
    Name = "${var.tf-sg}-ingress-rule"
  }
}

# Add a specific outbound "door" to public instance - Outbound Traffic
resource "aws_vpc_security_group_egress_rule" "allow_all_outbound_ipv4" {
  security_group_id = aws_security_group.allow_ssh_sg.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  tags = {
    Name = "${var.tf-sg}-egress-rule"
  }
  # Helpful description (optional but recommended)
  description = "Allow internet access to download packages"
}

# Create Security Group for Private Instance level - SSH, Http, Https
# SSH from *my IP* (needed for the EIC Endpoint's preserve_client_ip path) is
# not redefined here — it's already granted by attaching allow_ssh_sg
# (see server_provisioning.tf) to this instance's ENI, since SG rules union.
resource "aws_security_group" "private_instance_sg" {
  name        = "${var.tf-sg}-private-instance-sg"
  description = "Allow (Transport Layer Security) TLS inbound traffic and all outbound traffic"
  vpc_id      = aws_vpc.tf_vpc.id

  # ---------------
  # INBOUND RULES
  # ---------------

  # Rule 1 — HTTP from internet
  ingress {
    description = "Allow HTTP from the internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Rule 2 — HTTPS from internet
  ingress {
    description = "Allow HTTPS from the internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Rule 3 — SSH from Bastion/Public EC2 (for -J ProxyJump or -A agent forwarding)
  ingress {
    description     = "Allow SSH from Bastion Public SG"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.allow_ssh_sg.id]
  }

  # Rule 4 — SSH from YOUR IP, because the EIC Endpoint has preserve_client_ip = true
  ingress {
    description = "Allow SSH from my IP via EIC Endpoint"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.my_ip]
  }

  # ---------------
  # OUTBOUND RULES
  # ---------------

  # Allow all outbound
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.tf-sg}-private-instance-sg"
  }
}

# -----------------------------------------
# EC2 Instance Connect (EIC) Endpoint Implementation
# Only one job: letting you SSH (or RDP) into an EC2 instance that doesn't have a public IP
# -----------------------------------------

# Security Group for EC2 Instance Connect (EIC) Endpoint
resource "aws_security_group" "eic_endpoint_sg" {
  name        = "eic-endpoint-sg"
  description = "Security Group for EC2 Instance Connect Endpoint"
  vpc_id      = aws_vpc.tf_vpc.id

  # No inbound rules needed — EIC Endpoint initiates outbound connections only

  egress {
    description = "Allow SSH outbound to private instances"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.tf_vpc.cidr_block] # cidr_blocks expects a list wrapped in []
  }

  tags = {
    Name = "eic-endpoint-sg"
  }
}

# -----------------------------------------
# Aurora Security Group Implementation
# -----------------------------------------

resource "aws_security_group" "aurora_sg" {
  name        = "aurora-sg"
  description = "Aurora Security Group to allow ingress and egress"
  tags = {
    Name = "aurora_sg"
  }
  vpc_id = aws_vpc.tf_vpc.id
  ingress {
    description     = "Allow Aurora MySQL "
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2_host_sg.id]
  }

  # Allow all outbound
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# SSH from *my IP* is not redefined here — it's already granted by attaching
# allow_ssh_sg (see rds/server_provisioning.tf) alongside this SG.
resource "aws_security_group" "ec2_host_sg" {
  name        = "ec2-host-sg"
  description = "EC2 Host - no inbound, SSM is outbound-only"
  tags = {
    Name = "ec2-host-sg"
  }
  vpc_id = aws_vpc.tf_vpc.id

  egress {
    description = "Allow all outbound (needed to reach SSM endpoints)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}