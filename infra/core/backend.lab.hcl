# Supplies the one value missing from the backend "s3" block in main.tf.
#
#   terraform init -backend-config=backend.lab.hcl
#
# Account: lab / sandbox (auto-wiped, so re-run infra/bootstrap first).
# Not a secret — a bucket name is an identifier, and access is controlled by IAM.
bucket = "nfx-org-sandbox-state-us-east-1"
