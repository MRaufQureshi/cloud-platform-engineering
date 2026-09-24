# Shortcuts for this stack. Run `make` with no target to list them.
#
# Two Makefile rules that bite everyone:
#   - recipe lines must start with a TAB, never spaces
#   - each line runs in its own shell, so `cd` does not carry to the next line

REGION  := us-east-1
CLUSTER := myapp-cluster
SERVICE := myapp-service
APP_DIR := ../../apps/node-ecs-service

.DEFAULT_GOAL := help
.PHONY: help init plan apply destroy bootstrap seed logs url check-account

help: ## show this list
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

check-account: ## print which AWS account your current credentials belong to
	@aws sts get-caller-identity --query '[Account,Arn]' --output text

init: ## one-time per clone: wire up the S3 backend
	terraform init -backend-config=backend.personal.hcl

plan: ## preview changes
	terraform plan

apply: ## build or update the platform
	terraform apply

destroy: ## tear everything down (force_delete on ECR removes images too)
	terraform destroy

# ---------------------------------------------------------------------------
# FIRST APPLY ONLY.
#
# Terraform creates an EMPTY ECR repository and, in the same apply, a service
# whose task definition points at an image inside it. Nothing has been pushed
# yet, so tasks fail with CannotPullContainerError until one is.
#
# Real pipelines avoid this by pointing the first task definition at a public
# placeholder image, or by starting the service at desired_count = 0, or by
# ordering the app pipeline before the infra pipeline. Doing it by hand once is
# honest for day one of a new stack.
# ---------------------------------------------------------------------------
bootstrap: apply seed ## first apply: build the platform, then seed the image
	aws ecs update-service --cluster $(CLUSTER) --service $(SERVICE) \
	  --force-new-deployment --region $(REGION) >/dev/null
	aws ecs wait services-stable --cluster $(CLUSTER) --services $(SERVICE) --region $(REGION)
	@echo "ready: $$(terraform output -raw alb_url)"

seed: ## build and push the :bootstrap image (one shell — cd must not leak)
	@ECR=$$(terraform output -raw ecr_repository_url); \
	aws ecr get-login-password --region $(REGION) \
	  | docker login --username AWS --password-stdin $$ECR; \
	cd $(APP_DIR) && \
	docker build -f Dockerfile.multi --platform linux/amd64 --provenance=false \
	  -t $$ECR:bootstrap . && \
	docker push $$ECR:bootstrap

url: ## print the public URL
	@terraform output -raw alb_url; echo

logs: ## tail container logs
	aws logs tail /ecs/myapp --follow --region $(REGION)
