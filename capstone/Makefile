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
OPT_DIR := $(CAPSTONE_DIR)/apps/optimizer

.DEFAULT_GOAL := help
.PHONY: help check-account prerequisites bootstrap init plan apply destroy seed-optimizer deploy-optimizer optimizer-logs prices

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

# ---- STEP 3: the actual platform (local, or the THEO Infra Run button in CI) ----
init: ## wire the theo stack to the S3 backend (needs backend.lab.hcl)
	$(TF) init -backend-config=backend.lab.hcl

plan: ## preview changes
	$(TF) plan

apply: ## build or update THEO
	$(TF) apply

destroy: ## tear everything down
	$(TF) destroy

# ---------------------------------------------------------------------------
# FIRST APPLY ONLY (Phase 3).
#
# Terraform creates an EMPTY ECR repository and, in the same apply, a service
# whose task definition points at an image inside it. Nothing has been pushed
# yet, so the task cannot start until one is. This builds the first image and
# tells the service to try again. After that, CI (theo-app-deploy.yml) pushes
# every new version. Same chicken-and-egg as infra/ecs-fargate's `seed`.
# ---------------------------------------------------------------------------
seed-optimizer: ## build and push the :bootstrap optimizer image, then restart the service
	@ECR=$$($(TF) output -raw ecr_repository_url); \
	aws ecr get-login-password --region $(REGION) \
	  | docker login --username AWS --password-stdin $${ECR%%/*}; \
	cd $(OPT_DIR) && \
	docker build --platform linux/amd64 --provenance=false -t $$ECR:bootstrap . && \
	docker push $$ECR:bootstrap
	aws ecs update-service --cluster theo-cluster --service theo-optimizer-service \
	  --force-new-deployment --region $(REGION) >/dev/null
	aws ecs wait services-stable --cluster theo-cluster --services theo-optimizer-service --region $(REGION)
	@echo "optimizer is running"

# Same steps as the THEO App Deploy workflow, for before CI is set up. Every push
# needs a NEW tag because the ECR repository is IMMUTABLE (a tag cannot be reused).
deploy-optimizer: ## build, push (new tag) and roll out the optimizer by hand
	@set -e; TAG=$$(date +%Y%m%d%H%M%S); \
	ECR=$$($(TF) output -raw ecr_repository_url); \
	aws ecr get-login-password --region $(REGION) | docker login --username AWS --password-stdin $${ECR%%/*}; \
	( cd $(OPT_DIR) && docker build --platform linux/amd64 --provenance=false -t $$ECR:$$TAG . && docker push $$ECR:$$TAG ); \
	aws ecs describe-task-definition --task-definition theo-optimizer --region $(REGION) --query taskDefinition \
	  | jq --arg img "$$ECR:$$TAG" 'del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy) | .containerDefinitions[0].image=$$img | with_entries(select(.value != null))' \
	  > /tmp/theo-taskdef.json; \
	REV=$$(aws ecs register-task-definition --cli-input-json file:///tmp/theo-taskdef.json --region $(REGION) --query taskDefinition.taskDefinitionArn --output text); \
	aws ecs update-service --cluster theo-cluster --service theo-optimizer-service --task-definition $$REV --region $(REGION) >/dev/null; \
	aws ecs wait services-stable --cluster theo-cluster --services theo-optimizer-service --region $(REGION); \
	echo "deployed $$TAG"

# The daily 13:05 UTC schedule runs the same function. A schedule cannot be
# "run now" from the console, so for a demo you invoke the Lambda directly.
prices: ## fetch the day-ahead prices now (what the daily schedule does)
	aws lambda invoke --function-name theo-price-fetcher --region $(REGION) \
	  --cli-binary-format raw-in-base64-out /dev/stdout

optimizer-logs: ## tail the optimizer's logs
	aws logs tail /ecs/theo-optimizer --follow --region $(REGION)
