# Create VPC
resource "aws_vpc" "tf_vpc" {
  cidr_block = var.cidr_block
  # enable_dns_hostnames = true # Necessary if you ever want to reach any instance by name again.
  tags = {
    Name = "tf-vpc"
  }
}

# Create Public Subnet in east-1a
resource "aws_subnet" "e1a-public-subnet" {
  vpc_id            = aws_vpc.tf_vpc.id
  cidr_block        = var.public_subnet_block_e1a
  availability_zone = var.az_east_1a
  tags = {
    Name = "e1a-public-subnet" # ← This is what appears in AWS Console as name
  }
}

# Create Private Subnet in east-1a
resource "aws_subnet" "e1a-private-subnet" {
  vpc_id            = aws_vpc.tf_vpc.id
  cidr_block        = var.private_subnet_block_e1a
  availability_zone = var.az_east_1a
  tags = {
    Name = "e1a-private-subnet"
  }
}

# Create Public Subnet in east-1b
resource "aws_subnet" "e1b-public-subnet" {
  vpc_id            = aws_vpc.tf_vpc.id
  cidr_block        = var.public_subnet_block_e1b
  availability_zone = var.az_east_1b
  tags = {
    Name = "rds-public-subnet" # ← This is what appears in AWS Console as name
  }
}

# Create Private Subnet in east-1b
resource "aws_subnet" "e1b-private-subnet" {
  vpc_id            = aws_vpc.tf_vpc.id
  cidr_block        = var.private_subnet_block_e1b
  availability_zone = var.az_east_1b
  tags = {
    Name = "rds-private-subnet"
  }
}

# Create IGW
resource "aws_internet_gateway" "tf-igw" {
  vpc_id = aws_vpc.tf_vpc.id
  tags = {
    Name = "tf-igw"
  }
}

# Create Public RTB
resource "aws_route_table" "public-rtb" {
  vpc_id = aws_vpc.tf_vpc.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.tf-igw.id
  }
  depends_on = [aws_internet_gateway.tf-igw]
  tags = {
    Name = "public-rtb"
  }
}

# Create Private RTB
resource "aws_route_table" "private-rtb" {
  vpc_id = aws_vpc.tf_vpc.id
  tags = {
    Name = "private-rtb"
  }
}

# Create Association with Public-RTB for east-1a
resource "aws_route_table_association" "public-rtb" {
  subnet_id      = aws_subnet.e1a-public-subnet.id
  route_table_id = aws_route_table.public-rtb.id
}

# Create Association with Private-RTB for east-1a
resource "aws_route_table_association" "private-rtb" {
  subnet_id      = aws_subnet.e1a-private-subnet.id
  route_table_id = aws_route_table.private-rtb.id
}

# Create Association with Public-RTB for east-1b
resource "aws_route_table_association" "e1b-public-rtb" {
  subnet_id      = aws_subnet.e1b-public-subnet.id
  route_table_id = aws_route_table.public-rtb.id
}

# Create Association with Private-RTB for east-1b
resource "aws_route_table_association" "e1b-private-rtb" {
  subnet_id      = aws_subnet.e1b-private-subnet.id
  route_table_id = aws_route_table.private-rtb.id
}

# Allocate the Elastic IP
# resource "aws_eip" "tf-eip-nat" {
#   tags = {
#     Name = "tf-elastic-ip"
#   }
# }

# Create NAT Gateway, Assign Elastic IP, IMP.NOTE # Place in Public Subnet 
# resource "aws_nat_gateway" "tf-NAT" {
#   allocation_id = aws_eip.tf-eip-nat.id
#   subnet_id     = aws_subnet.e1a-public-subnet.id
#   # To ensure proper ordering, it is recommended to add an explicit dependency
#   # on the NAT Gateway
#   depends_on = [aws_eip.tf-eip-nat]
#   tags = {
#     Name = "tf-nat-gateway-in-public"
#   }
# }

# Point NAT Gateway to Private Subnet by adding Route in Private RTB 
# resource "aws_route" "tf-private_nat_route" {
#   route_table_id         = aws_route_table.private-rtb.id
#   destination_cidr_block = "0.0.0.0/0" # <- Forwards the request to the NAT Gateway (which sits in a public subnet)
#   # If traffic is heading to the outside internet, 
#   # send it directly to our NAT Gateway.
#   nat_gateway_id = aws_nat_gateway.tf-NAT.id
# }

# -----------------------------------------
# EC2 Instance Connect (EIC) Endpoint Implementation
# Only one job: letting you SSH (or RDP) into an EC2 instance that doesn't have a public IP
# -----------------------------------------

# EC2 Instance Connect Endpoint - To connet without SSH
resource "aws_ec2_instance_connect_endpoint" "eic_endpoint" {
  subnet_id          = aws_subnet.e1a-private-subnet.id
  security_group_ids = [aws_security_group.eic_endpoint_sg.id]

  # Preserve client IP — when true, the private EC2's Security Group must allow inbound port 22 from YOUR IP.
  # When false, it must allow inbound port 22 from the EIC Endpoint's SG.
  preserve_client_ip = true

  tags = {
    Name = "eic-endpoint"
  }
}