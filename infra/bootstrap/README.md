# bootstrap

Creates the S3 bucket that every other Terraform stack in this repo stores its
state in. Run once per AWS account, before anything else.

---

## What you'll learn

- **Why remote state exists** — and why local state disqualifies a stack from CI
- **The chicken-and-egg problem**: Terraform can't store state in a bucket it
  hasn't created yet, so exactly one stack has to run without a backend
- **State locking** — what stops two people applying at the same time
- **Versioning on a state bucket** — your undo button when state goes wrong

## What's implemented

- S3 bucket for Terraform state, **versioned** and **encrypted** (AES256)
- DynamoDB table for state locking, `PAY_PER_REQUEST`
- Outputs both names, so you know what to put in the other stacks' backend config

---

## Prerequisites

- Terraform ≥ 1.10, AWS CLI v2 with credentials configured
- **Nothing else.** This is the first thing you run in a new account.

---

## Run it

```bash
cd infra/bootstrap

terraform init
terraform apply
```

Terraform will ask for two values:

```
var.bucket_name
  S3 bucket name for Terraform state

  Enter a value: yourname-terraform-state-us-east-1

var.lock_table_name
  DynamoDB table name for state locking

  Enter a value: terraform-state-locks
```

### Write the name down — every other stack needs it

Put it in two places:

```hcl
# infra/bootstrap/terraform.tfvars      - gitignored. stops the prompt next time.
bucket_name     = "yourname-terraform-state-us-east-1"
lock_table_name = "terraform-state-locks"
```

```hcl
# infra/core/backend.lab.hcl            - and the same in scaling/ and rds/
bucket = "yourname-terraform-state-us-east-1"
```

**Note it is `backend.*.hcl`, not `terraform.tfvars`, for the other stacks.**
A `backend` block is parsed before variables exist, so it cannot read `var.*`.
That is the reason those `.hcl` files exist at all.

```
infra/bootstrap/terraform.tfvars          bucket_name = "X"   - you invent it
infra/core/backend.lab.hcl                bucket      = "X"   - must match
infra/scaling/backend.lab.hcl             bucket      = "X"   - must match
infra/rds/backend.lab.hcl                 bucket      = "X"   - must match
infra/ecs-fargate/backend.personal.hcl    bucket      = "Y"   - different account
```

Get one of them wrong and `terraform init` fails with `NoSuchBucket`, or —
worse — silently creates a second, empty state file and plans to build
everything again.

---

## How it's wired

Nothing reads this stack's state. The other stacks consume its **result** — the
bucket — by name, supplied at init time:

```
infra/bootstrap        creates  →  s3://your-bucket
                                        ▲
infra/core             backend.lab.hcl ─┤     key = core/terraform.tfstate
infra/scaling          backend.lab.hcl ─┤     key = scaling/terraform.tfstate
infra/rds              backend.lab.hcl ─┤     key = rds/terraform.tfstate
infra/ecs-fargate      backend.personal.hcl   key = ecs-fargate/terraform.tfstate
```

---

## Teardown

**Destroying the other stacks does not touch this one.**

```bash
# other stacks FIRST, in reverse dependency order
cd infra/rds        && terraform destroy
cd ../scaling       && terraform destroy
cd ../core          && terraform destroy
cd ../ecs-fargate   && terraform destroy

# this one LAST
cd ../bootstrap     && terraform destroy
```

> **Order matters.** `force_destroy = true` means this will delete the bucket
> and every state file inside it without asking. Do it before the other stacks
> are destroyed and Terraform loses the record of what it owns — the AWS
> resources keep running, and keep billing, with nothing tracking them.

### Finding anything left behind

Resources Terraform never knew about — a console click, an interrupted apply —
are invisible to `destroy`. Tags are how you find them:

```bash
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=ManagedBy,Values=terraform \
  --region us-east-1 \
  --query 'ResourceTagMappingList[].ResourceARN' --output text | tr '\t' '\n'
```

Anything listed there that `terraform state list` does not claim is an orphan,
and has to be deleted by hand.

---

## Cost

| | |
|---|---|
| S3 bucket | a few cents/month — state files are kilobytes |
| DynamoDB table | `PAY_PER_REQUEST`, effectively $0 at this volume |

Call it **under $0.10/month**. This is the one stack you can leave running.

> Prices change and vary by region. Always check the
> [AWS pricing calculator](https://calculator.aws) — the numbers here are a
> reference point, not a quote.
