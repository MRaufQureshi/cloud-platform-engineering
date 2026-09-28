# -------------------------------------
# Database configure + Aurora clustering
# -------------------------------------
resource "aws_db_subnet_group" "aurora" {
  name = "aurora-subnet-group"
  # Define subnet ID to mention which two AZs does Aurora need spanned
  subnet_ids = [data.terraform_remote_state.root.outputs.private_subnet_id_e1a, data.terraform_remote_state.root.outputs.private_subnet_id_e1b]
  tags = {
    Name = "aurora-subnet-group"
  }
}

# Run this for picking version: 
#aws rds describe-db-engine-versions --engine aurora-mysql --default-only --query "DBEngineVersions[].EngineVersion" --output table

resource "aws_rds_cluster" "aurora" {
  cluster_identifier     = "aurora"
  engine                 = "aurora-mysql"
  engine_version         = var.engine_version
  database_name          = var.db_name
  master_username        = var.db_master_username
  master_password        = var.db_master_password
  db_subnet_group_name   = aws_db_subnet_group.aurora.name
  vpc_security_group_ids = [data.terraform_remote_state.root.outputs.aurora_sg_id]
  # Off because it cannot be toggled on an existing cluster — enabling it
  # forces a replacement. Turn it on the day this stops being a lab.
  storage_encrypted = false
  # No final snapshot on destroy. Correct for a lab that is rebuilt constantly,
  # wrong anywhere data matters.
  skip_final_snapshot = true
}

resource "aws_rds_cluster_instance" "aurora_instance" {
  cluster_identifier         = aws_rds_cluster.aurora.id
  instance_class             = var.db_instance_class
  engine                     = aws_rds_cluster.aurora.engine
  engine_version             = aws_rds_cluster.aurora.engine_version
  monitoring_interval        = 0 # enhanced monitoring off
  auto_minor_version_upgrade = false
}
