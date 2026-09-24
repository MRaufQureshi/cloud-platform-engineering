# Shortcuts for this stack. Run `make` with no target to list them.
# These wrap plain terraform/aws commands — nothing is hidden. Use terraform
# directly if you prefer; the README documents both.
#
# Three Makefile rules that bite everyone:
#   - recipe lines must start with a TAB, never spaces
#   - each line runs in its OWN shell, so `cd` does not carry to the next line
#   - $$ escapes a dollar so the shell sees it, not make

# Everything below is resolved from THIS FILE's location, not from your current
# directory, so `make -f infra/ecs-fargate/Makefile apply` works from anywhere.
# MAKEFILE_LIST holds the makefiles make has read; the last one is this file.
STACK_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
APP_DIR   := $(abspath $(STACK_DIR)/../../apps/node-ecs-service)

# -chdir is a terraform flag, not a shell cd: it changes directory before the
# subcommand runs, and must come BEFORE the subcommand.
TF := terraform -chdir=$(STACK_DIR)

# Must match var.project and var.region in variables.tf.
PROJECT := myapp
REGION  := us-east-1

CLUSTER   := $(PROJECT)-cluster
SERVICE   := $(PROJECT)-service
LOG_GROUP := /ecs/$(PROJECT)

.DEFAULT_GOAL := help
.PHONY: help init plan apply destroy bootstrap seed logs url check-account

help: ## show this list
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

check-account: ## print which AWS account your current credentials belong to
	@aws sts get-caller-identity --query '[Account,Arn]' --output text

init: ## one-time per clone: wire up the S3 backend
	$(TF) init -backend-config=backend.personal.hcl

plan: ## preview changes
	$(TF) plan

apply: ## build or update the platform
	$(TF) apply

destroy: ## tear everything down (force_delete on ECR removes images too)
	$(TF) destroy

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
	@echo "ready: $$($(TF) output -raw alb_url)"

seed: ## build and push the :bootstrap image
	@ECR=$$($(TF) output -raw ecr_repository_url); \
	aws ecr get-login-password --region $(REGION) \
	  | docker login --username AWS --password-stdin $$ECR; \
	cd $(APP_DIR) && \
	docker build -f Dockerfile.multi --platform linux/amd64 --provenance=false \
	  -t $$ECR:bootstrap . && \
	docker push $$ECR:bootstrap

url: ## print the public URL
	@$(TF) output -raw alb_url; echo

logs: ## tail container logs
	aws logs tail $(LOG_GROUP) --follow --region $(REGION)
