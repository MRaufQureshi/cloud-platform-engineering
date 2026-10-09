# modules/network/outputs.tf — what later modules need from the network.

output "vpc_id" {
  value = aws_vpc.main.id
}

output "vpc_cidr" {
  value = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "private_route_table_id" {
  value = aws_route_table.private.id
}

output "nat_public_ip" {
  description = "Fixed public address of everything in the private subnets"
  value       = aws_eip.nat.public_ip
}

output "sim_sg_id" {
  value = aws_security_group.sim.id
}

output "obs_sg_id" {
  value = aws_security_group.obs.id
}

output "fargate_sg_id" {
  value = aws_security_group.fargate.id
}

output "vpce_sg_id" {
  value = aws_security_group.vpce.id
}
