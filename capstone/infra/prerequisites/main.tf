# capstone/infra/prerequisites/main.tf
#
# STEP 1 of 3. Run this ONCE, from your laptop, before anything else.
#
# WHY IT IS ITS OWN STEP: GitHub Actions needs an AWS identity before it can
# deploy anything, and that identity has to exist *outside* the stack it
# deploys. If `terraform destroy` on the main stack could delete the role CI
# uses, you would lock yourself out of your own pipeline. So these live here,
# with local state, and are only ever created by a human.
#
# WHAT IT BUILDS (4 resources):
#   1. the GitHub OIDC identity provider      - "AWS, consider GitHub's tokens"
#   2. github-actions-theo-terraform-plan role     - read-only, used on pull requests
#   3. github-actions-theo-terraform-apply role    - can build/destroy, main branch only
#   4. an inline IAM policy for the apply role
#
# The lab account wipes itself. After a wipe, delete the stale local
# terraform.tfstate in this folder and run this again.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region

  # Same guard as infra/ecs-fargate: wrong credentials pasted in = plan fails
  # before a single API call.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = "theo"
      Stack     = "prerequisites"
      ManagedBy = "terraform"
    }
  }
}

locals {
  # GitHub's *immutable-ID* subject format, same as PREREQUISITES.md. Names can
  # be reclaimed by a stranger after a repo is deleted; numeric IDs cannot.
  repo_sub = "repo:${var.github_org}@${var.github_org_id}/${var.github_repo}@${var.github_repo_id}"
}

# --------------------------------------------------------------------------
# 1. The identity provider. One per account - if your account already has one
# this fails with EntityAlreadyExists; in that case remove this resource and
# look the existing one up with a `data` block instead.
# --------------------------------------------------------------------------
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS ignores this value for GitHub (it validates against its own trusted CA
  # list), but the argument is required by provider 5.x.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

# --------------------------------------------------------------------------
# 2. PLAN role - assumed by pull_request runs and by main.
# Read-only: it can look at everything and change nothing.
# --------------------------------------------------------------------------
data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # THE SECURITY BOUNDARY. Without this condition any repository on GitHub
    # could assume this role. Pull requests and the main branch only.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.repo_sub}:pull_request", "${local.repo_sub}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "plan" {
  name               = "github-actions-theo-terraform-plan"
  assume_role_policy = data.aws_iam_policy_document.plan_trust.json
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

# ReadOnlyAccess can read the state file, but `terraform init` on a fresh
# runner still wants to be sure the bucket answers. Nothing here writes.

# --------------------------------------------------------------------------
# 3. APPLY role - main branch only (push, or the manual "THEO Infra Run" button
# started from main). Pull requests can NEVER assume it.
# --------------------------------------------------------------------------
data "aws_iam_policy_document" "apply_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.repo_sub}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "apply" {
  name               = "github-actions-theo-terraform-apply"
  assume_role_policy = data.aws_iam_policy_document.apply_trust.json
}

# PowerUserAccess = everything except IAM and Organizations. That covers every
# service THEO uses (VPC, IoT, ECS, Lambda, CloudFront, Cognito, ...).
resource "aws_iam_role_policy_attachment" "apply_poweruser" {
  role       = aws_iam_role.apply.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

# ...and THEO creates ~20 IAM roles of its own, so the apply role needs IAM too.
# HONEST TRADEOFF: a role that can create roles can mint itself more power, so
# this is effectively admin. Acceptable in a throwaway lab account with the
# trust policy above locked to main. In production you would add a permissions
# boundary so created roles can never exceed a ceiling.
resource "aws_iam_role_policy" "apply_iam" {
  name = "iam-for-terraform"
  role = aws_iam_role.apply.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "ManageIamForTheStack"
      Effect = "Allow"
      Action = [
        "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole",
        "iam:TagRole", "iam:UntagRole", "iam:PassRole", "iam:ListRoleTags",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListAttachedRolePolicies",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy", "iam:ListRolePolicies",
        "iam:ListInstanceProfilesForRole", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
        "iam:GetInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile",
        "iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:GetPolicyVersion",
        "iam:ListPolicyVersions", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion",
        "iam:CreateServiceLinkedRole",
      ]
      Resource = "*" # role names are generated per stack; a wildcard is the only practical scope here
    }]
  })
}
