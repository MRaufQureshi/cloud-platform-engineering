# Capstone prerequisites

What must exist before the THEO capstone builds, and how little of it you do by
hand. The repo's root [PREREQUISITES.md](../PREREQUISITES.md) covers `core`,
`scaling`, `rds` and `ecs-fargate`; this file covers only the capstone, which
automates most of that with its own three-step ladder.

> Everything here targets the **lab account (464447071956)**, `us-east-1`. The
> lab wipes itself, so the whole list is repeatable.

| # | What | How | When |
|---|---|---|---|
| 1 | AWS CLI v2, Terraform ≥ 1.10, `make` | install locally | once per machine |
| 2 | Lab credentials | `make -C capstone check-account` must print `464447071956` | every session |
| 3 | GitHub OIDC provider + CI roles | **`make -C capstone prerequisites`** | once per lab wipe |
| 4 | Terraform state bucket | **`make -C capstone bootstrap`** | once per lab wipe |
| 5 | GitHub repo Variables (three) plus one secret, `MY_IP` (from Phase 1) | by hand (below) | after steps 3 and 4 |
| 6 | Docker, Node.js | install locally | Phase 3 (optimizer) and Phase 6 (frontend) |

Items 3 and 4 are Terraform in `infra/prerequisites/` and `infra/bootstrap/`.
Nothing else needs creating by hand: no key pairs (EC2 uses SSM Session Manager),
no budget (the lab is a sandbox), no domain (Route53 is out of scope for now).

---

## 1. Check your credentials

```bash
make -C capstone check-account
```

Must print `464447071956`. If it prints your personal account, stop: the
`allowed_account_ids` guard would refuse to run anyway.

## 2. Step 1 — `prerequisites`

```bash
make -C capstone prerequisites
```

Creates the GitHub OIDC provider and two roles:

| Role | Can do | Assumed by |
|---|---|---|
| `github-actions-theo-terraform-plan` | read-only | pull requests and `main` |
| `github-actions-theo-terraform-apply` | build and destroy | `main` only |

Why it cannot run in CI: it creates the very access CI needs. Details in
[infra/prerequisites/README.md](infra/prerequisites/README.md).

## 3. Step 2 — `bootstrap`

```bash
make -C capstone bootstrap
```

Creates the S3 bucket for the `theo` stack's state. Details in
[infra/bootstrap/README.md](infra/bootstrap/README.md). It prints the bucket
name and the exact `backend.lab.hcl` line.

## 4. Set the GitHub repo Variables
(Three Variables, plus the `MY_IP` secret from Phase 1 on.)

Settings → Secrets and variables → Actions → **Variables** → New repository
variable. (Variables, not Secrets: role ARNs and bucket names are not secret,
and the workflows read them as `vars.*`.)

| Variable | Value | Printed by |
|---|---|---|
| `AWS_THEO_ROLE_APPLY` | ARN of `github-actions-theo-terraform-apply` | step 1 |
| `AWS_THEO_ROLE_PLAN` | ARN of `github-actions-theo-terraform-plan` | step 1 |
| `THEO_STATE_BUCKET` | bucket name | step 2 |

And one **secret** (Settings → Secrets and variables → Actions → **Secrets** →
New repository secret):

| Secret | Value |
|---|---|
| `MY_IP` | your public IP, no `/32` (`curl -s https://checkip.amazonaws.com`) |

It is a secret, not a Variable, because this repository is public: a Variable can
be read by anyone, and the IP is personal. It is the only address allowed to open
Grafana. Your ISP rotates it, so update it when it changes.

These are deliberately separate from `AWS_ROLE_LAB` / `TF_STATE_BUCKET_LAB`, which
belong to `core`, `scaling` and `rds`. The two sets never overlap.

Until the Variables exist, the `plan` job in `theo-ci.yml` skips itself, so
pull requests are never red for want of a bucket.

## 5. Step 3 — the platform

```bash
cd capstone/infra/theo
cp backend.lab.hcl.example backend.lab.hcl     # paste the bucket from step 2
cp terraform.tfvars.example terraform.tfvars   # set my_ip (Phase 1 on)
cd ../../.. && make -C capstone init plan
```

Or: **Actions → T.H.E.O. Infra Run**.

---

## After a lab wipe

The account resets; the files on your laptop do not.

1. Delete the stale `terraform.tfstate` in `capstone/infra/prerequisites/` and
   `capstone/infra/bootstrap/`.
2. Repeat steps 1 and 2.
3. Update the three repo Variables (the role ARNs and bucket are new objects; the
   names are the same, but the values can differ if the account ID does).

## Why these are not part of the main stack

Identities and state have to outlive the infrastructure they serve. If
`terraform destroy` on `theo` could delete the role CI uses, or the bucket
holding its own state, a teardown would lock you out of the pipeline or lose the
record of what exists. So they live in two small stacks that only a human runs.

## Troubleshooting

| Error | Meaning |
|---|---|
| `AWS Account ID not allowed` | credentials belong to another account; guard working as intended |
| `EntityAlreadyExists` on the OIDC provider | the account already has one; replace the resource with a `data` lookup |
| CI: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | the `sub` in the error does not match the IDs in `infra/prerequisites/variables.tf`, or the run is from a branch other than `main` (apply role) |
| the CI `plan` job is skipped | one of the repo Variables is missing |
