# modules/network/main.tf
#
# The VPC every other module lives in: 2 public subnets (internet-facing:
# simulator box, Grafana box, NAT), 2 private subnets (the optimizer, which
# must never have a public IP), an internet gateway, and one NAT gateway.
#
#   public  --route 0.0.0.0/0--> Internet Gateway   (two-way: can be reached)
#   private --route 0.0.0.0/0--> NAT Gateway        (one-way: can only call out)
#
# One NAT (not one per AZ) is deliberate: ~$0.045/h each, and this is a demo.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # required for interface endpoints' private DNS

  tags = { Name = "${var.project_name}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.project_name}-igw" }
}

# --- Subnets ---------------------------------------------------------------
# count = 2 creates two copies; count.index picks the matching AZ and CIDR.
resource "aws_subnet" "public" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true

  tags = { Name = "${var.project_name}-public-${substr(var.azs[count.index], -1, 1)}" }
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.private_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = false

  tags = { Name = "${var.project_name}-private-${substr(var.azs[count.index], -1, 1)}" }
}

# --- NAT gateway -----------------------------------------------------------
# Lives in a PUBLIC subnet (it needs the internet gateway) and gives the private
# subnets outbound-only internet. The Elastic IP is its fixed public address;
# destroying the NAT releases it, so nothing is left billing.
resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${var.project_name}-nat-eip" }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = { Name = "${var.project_name}-nat" }

  # The NAT needs the internet gateway to exist first.
  depends_on = [aws_internet_gateway.main]
}

# --- Route tables ----------------------------------------------------------
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.project_name}-public-rt" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = { Name = "${var.project_name}-private-rt" }
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}
