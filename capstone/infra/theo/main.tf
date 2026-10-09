# capstone/infra/theo/main.tf
#
# The wiring file: it calls each module and passes outputs from one into the
# next. Modules are added phase by phase (see capstone/README.md):
#
#   Phase 1  module "network"        module "data"
#   Phase 2  module "iot"            module "simulator"
#   Phase 3  module "optimizer"
#   Phase 4  module "ingestion"
#   Phase 5  module "api"                                    <- here
#   Phase 6  module "frontend"
#   Phase 6b module "landing"
#   Phase 7  module "observability"  module "security"

data "aws_caller_identity" "current" {}

# VPC, subnets, NAT, security groups, VPC endpoints.
module "network" {
  source = "./modules/network"

  project_name = var.project_name
  region       = var.region
  my_ip        = var.my_ip
}

# DynamoDB tables and S3 buckets.
module "data" {
  source = "./modules/data"

  project_name = var.project_name
  account_id   = data.aws_caller_identity.current.account_id
}

# Devices in the IoT registry: things, certificates, policies, and the rules
# that copy telemetry into DynamoDB.
module "iot" {
  source = "./modules/iot"

  project_name            = var.project_name
  telemetry_table_name    = module.data.table_names["telemetry"]
  telemetry_table_arn     = module.data.table_arns["telemetry"]
  device_state_table_name = module.data.table_names["device-state"]
  device_state_table_arn  = module.data.table_arns["device-state"]
  replan_queue_arn        = module.optimizer.replan_queue_arn
  replan_queue_url        = module.optimizer.replan_queue_url
}

# EC2 box running the three virtual devices.
module "simulator" {
  source = "./modules/simulator"

  project_name      = var.project_name
  subnet_id         = module.network.public_subnet_ids[0]
  security_group_id = module.network.sim_sg_id
  data_bucket_name  = module.data.data_bucket_name
  data_bucket_arn   = module.data.data_bucket_arn
  iot_endpoint      = module.iot.iot_endpoint
  device_ids        = module.iot.device_ids
  certificates      = module.iot.certificates
  code_dir          = "${path.root}/../../apps/simulator"
}

# SQS replan queue + DLQ, ECR repository, and the Fargate service that solves
# the schedules. Runs in the private subnets.
module "optimizer" {
  source = "./modules/optimizer"

  project_name       = var.project_name
  region             = var.region
  private_subnet_ids = module.network.private_subnet_ids
  fargate_sg_id      = module.network.fargate_sg_id
  table_names        = module.data.table_names
  table_arns         = module.data.table_arns
}

# The daily price fetcher (EventBridge + Lambda) and the forecast stub.
module "ingestion" {
  source = "./modules/ingestion"

  project_name      = var.project_name
  code_dir          = "${path.root}/../../apps/lambdas"
  prices_table_name = module.data.table_names["prices"]
  prices_table_arn  = module.data.table_arns["prices"]
  data_bucket_name  = module.data.data_bucket_name
  data_bucket_arn   = module.data.data_bucket_arn
  replan_queue_url  = module.optimizer.replan_queue_url
  replan_queue_arn  = module.optimizer.replan_queue_arn
  device_ids        = module.iot.device_ids
}

# Cognito login + API Gateway (JWT check) + the API Lambda.
module "api" {
  source = "./modules/api"

  project_name     = var.project_name
  region           = var.region
  code_dir         = "${path.root}/../../apps/lambdas"
  table_names      = module.data.table_names
  table_arns       = module.data.table_arns
  replan_queue_url = module.optimizer.replan_queue_url
  replan_queue_arn = module.optimizer.replan_queue_arn
  iot_endpoint     = module.iot.iot_endpoint
  device_ids       = module.iot.device_ids

  # Phase 6 adds the CloudFront address here. Until then only a local dev server
  # (npm run dev) may call the API from a browser.
  allowed_origins = ["http://localhost:5173"]
}
