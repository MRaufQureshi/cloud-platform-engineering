# Shortcuts for the THEO capstone. Run `make` with no target to list them.
# These wrap plain terraform/aws commands — nothing is hidden. Use terraform
# directly if you prefer; the READMEs document both.
#
# Recipe lines must start with a TAB. Each line runs in its OWN shell, so `cd`
# does not carry to the next line.

CAPSTONE_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
LAB_ACCOUNT  := 464447071956
REGION       := us-east-1

PREREQ := terraform -chdir=$(CAPSTONE_DIR)/infra/prerequisites
BOOT   := terraform -chdir=$(CAPSTONE_DIR)/infra/bootstrap
TF     := terraform -chdir=$(CAPSTONE_DIR)/infra/theo

.DEFAULT_GOAL := help
.PHONY: help check-account prerequisites bootstrap init plan apply destroy optimizer-logs prices frontend-config

help: ## show this list
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

check-account: ## print which AWS account your credentials belong to (must be the lab)
	@aws sts get-caller-identity --query '[Account,Arn]' --output text
	@echo "expected account: $(LAB_ACCOUNT)"

# ---- STEP 1 and 2: once per lab wipe, always local -------------------------
prerequisites: ## STEP 1: GitHub OIDC provider + CI roles (local state)
	$(PREREQ) init
	$(PREREQ) apply
	@$(PREREQ) output -raw next_steps

bootstrap: ## STEP 2: S3 bucket for Terraform state (local state)
	$(BOOT) init
	$(BOOT) apply
	@$(BOOT) output -raw next_steps

# ---- STEP 3: the actual platform (local, or the T.H.E.O. Infra Run button in CI) ----
init: ## wire the theo stack to the S3 backend (needs backend.lab.hcl)
	$(TF) init -backend-config=backend.lab.hcl

plan: ## preview changes
	$(TF) plan

apply: ## build or update THEO
	$(TF) apply

destroy: ## tear everything down
	$(TF) destroy

# The daily 13:05 UTC schedule runs the same function. A schedule cannot be
# "run now" from the console, so for a demo you invoke the Lambda directly.
prices: ## fetch the day-ahead prices now (what the daily schedule does)
	aws lambda invoke --function-name theo-price-fetcher --region $(REGION) \
	  --cli-binary-format raw-in-base64-out /dev/stdout

# For `npm run dev`: copy the live config.json (API address, login IDs) next to the source.
frontend-config: ## download config.json for local development
	@ACCOUNT=$$(aws sts get-caller-identity --query Account --output text); \
	aws s3 cp s3://theo-site-$$ACCOUNT/config.json $(CAPSTONE_DIR)/apps/frontend/public/config.json

optimizer-logs: ## tail the optimizer's logs
	aws logs tail /ecs/theo-optimizer --follow --region $(REGION)
