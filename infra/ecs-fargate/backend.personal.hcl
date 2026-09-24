# Supplies the one value missing from the backend "s3" block in provider.tf:
#     terraform init -backend-config=backend.personal.hcl
#
# Account: personal 891105708394 (permanent). Not a secret — a bucket name is
# an identifier, and access to it is controlled by IAM.
bucket = "pantheon-m-org-terraform-state-us-east-1"
