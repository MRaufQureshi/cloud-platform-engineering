# modules/network/vpc_endpoints.tf
#
# VPC endpoints keep traffic to AWS services INSIDE the AWS network instead of
# going out through the NAT gateway.
#
#   Gateway endpoints  (S3, DynamoDB): FREE. Work by adding a route to a route table.
#   Interface endpoints (ECR, Logs, SQS, Secrets Manager): ~$0.01/hour each. Work
#     by placing a network interface in your subnet and overriding the service's
#     DNS name so the normal SDK call lands on it.
#
# This is how the private Fargate task pulls its image and writes logs without
# a public IP. The NAT is then only needed for the aWATTar API and the IoT data
# endpoint, which have no VPC endpoint here.

# --- Gateway endpoints (free) ----------------------------------------------
resource "aws_vpc_endpoint" "gateway" {
  for_each = toset(["s3", "dynamodb"])

  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.region}.${each.key}"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id, aws_route_table.public.id]

  tags = { Name = "${var.project_name}-vpce-${each.key}" }
}

# --- Interface endpoints (~1 cent/hour each) -------------------------------
# ECR needs TWO: "ecr.api" (login, image metadata) and "ecr.dkr" (the image
# layers themselves). Layers are stored in S3, which is why the S3 gateway
# endpoint above is also required for image pulls.
resource "aws_vpc_endpoint" "interface" {
  for_each = toset(["ecr.api", "ecr.dkr", "logs", "sqs", "secretsmanager"])

  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpce.id]
  private_dns_enabled = true # makes sqs.us-east-1.amazonaws.com resolve to the endpoint

  tags = { Name = "${var.project_name}-vpce-${each.key}" }
}
