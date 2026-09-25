# ecs-fargate

Terraform for the platform a containerised Node service runs on: **VPC → ALB →
ECS Fargate**. 17 resources, no dependency on any other stack in this repo.

Replaces the imperative `aws-setup.sh` this project started with.

---

## Quickstart

About 8 minutes, most of it waiting for the load balancer.

**Prerequisites:** Terraform ≥ 1.10, AWS CLI v2 with credentials configured,
Docker running.

```bash
cd infra/ecs-fargate
```

### 1. Do the one-time IAM setup

Terraform builds the platform. It does **not** build the IAM identities — those
have to exist first.

See **[PREREQUISITES.md](../../PREREQUISITES.md)**

| | needed for |
|---|---|
| `ecsTaskExecutionRole` | **required to `terraform apply` at all** |
| GitHub OIDC identity provider | the deploy pipeline only |
| `github-actions-ecs-deploy` role | the deploy pipeline only |
| `AWS_ROLE_ARN` repo variable | the deploy pipeline only |

The execution role is the one you cannot skip — `ecs.tf` reads it with a `data`
block, so a missing role fails at plan time:

```
Error: no IAM role by that name: ecsTaskExecutionRole
```

Most accounts already have it; the ECS console creates it the first time anyone
builds a service. Check with `aws iam get-role --role-name ecsTaskExecutionRole`.

The other three only matter when you want CI to deploy. Without them the
platform still builds and serves traffic.

### 2. Point the stack at your AWS account

Two values to change, both in this directory.

**`variables.tf`** — your 12-digit AWS account ID:

```hcl
variable "aws_account_id" {
  default = "8911XXX08XXX"      # replace with YOUR account ID
}
```

**`backend.personal.hcl`** — an S3 bucket **you own**, for Terraform state:

```hcl
bucket = "Your-S3-Bucket-terraform-state-us-east-1"   # replace
```

S3 bucket names are globally unique. Any versioned, encrypted bucket works; `infra/bootstrap/` will create one for you.

Then confirm your credentials match what you just set:

```bash
aws sts get-caller-identity --query Account --output text
```

The number it prints must equal `aws_account_id`. If they differ, Terraform
stops before making a single API call:

```
Error: AWS Account ID not allowed: 46XXX707XXXX
```

That guard is `allowed_account_ids` in `provider.tf`. It exists because swapping
AWS credentials by hand is easy to get wrong, and the failure mode without it -
silently building a second copy of production in the wrong account.

### 3. Initialise

```bash
terraform init -backend-config=backend.personal.hcl
```

Once per clone. Downloads the AWS provider and connects to the state bucket.

Why is the bucket passed as a flag instead of living in `provider.tf`? A
`backend` block is parsed *before* variables exist, so it cannot use `var.*`.

Hardcoding a bucket name would tie this code to one AWS account. Leaving it out
and supplying it at init — "partial backend configuration" — keeps the code
portable:

```bash
terraform init -backend-config=backend.personal.hcl   # one account
terraform init -backend-config=backend.lab.hcl        # another
```

The value is read once and cached in `.terraform/`. `plan`, `apply` and
`destroy` need no flag afterwards. Delete `.terraform/` or clone fresh and you
pass it again.

### 4. Build the platform

```bash
terraform apply
```

Type `yes`. Creates all 17 resources. **Finishes with a working load balancer
and a broken service** - expected, steps 5 and 6 fix it. See
[Why the first apply needs a bootstrap](#why-the-first-apply-needs-a-bootstrap).

### 5. Push the first image

```bash
ECR=$(terraform output -raw ecr_repository_url)

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$ECR"

cd ../../apps/node-ecs-service

docker build -f Dockerfile.multi --platform linux/amd64 --provenance=false -t "$ECR:bootstrap" .

docker push "$ECR:bootstrap"

cd ../../infra/ecs-fargate
```

`--platform linux/amd64` because Fargate is x86_64 while an Apple Silicon Mac
builds arm64 by default - without it the task starts and dies with
`exec format error`. `--provenance=false` stops BuildKit adding attestation
manifests, which otherwise show up as two extra rows in ECR.

### 6. Start the tasks and wait

```bash
aws ecs update-service --cluster myapp-cluster --service myapp-service \
  --force-new-deployment --region us-east-1 >/dev/null

aws ecs wait services-stable --cluster myapp-cluster --services myapp-service --region us-east-1
```

2–4 minutes. `wait` prints nothing until it succeeds - the health check needs two
consecutive passes 30 seconds apart before a task counts as healthy.

### 7. See it running

```bash
terraform output -raw alb_url
curl "$(terraform output -raw alb_url)"
```

```json
{"version":"v4","hostname":"ip-10-0-0-223.ec2.internal"}
```

Open that URL in a browser, or look in the console:

| | |
|---|---|
| **ECS** → Clusters → `myapp-cluster` → `myapp-service` | 2 tasks RUNNING |
| **EC2** → Target Groups → `myapp-tg` → Targets | two IPs, both `healthy` |
| **CloudWatch** → Log groups → `/ecs/myapp` | two log streams |

Done. 

### 8. THE TEARDOWN

[Teardown is at the bottom - click here](#teardown).

---

## What you just built

```
                internet
                    │
                    ▼
        ┌───────────────────────┐   myapp-alb-sg  :80 from 0.0.0.0/0
        │  Application Load     │
        │  Balancer  (2 AZs)    │
        └───────────┬───────────┘
                    │ listener :80 → forward
                    ▼
        ┌───────────────────────┐   target_type = "ip"
        │  Target group         │   health check GET /health → 200
        └───────────┬───────────┘
                    │ registers task IPs
                    ▼
   ┌────────────────────────────────────┐   myapp-task-sg
   │  ECS service — 2 Fargate tasks     │   :3000 from myapp-alb-sg ONLY
   │  10.0.0.x (us-east-1a)             │
   │  10.0.1.x (us-east-1b)             │
   └──────┬──────────────────────┬──────┘
          │ pulls image          │ writes logs
          ▼                      ▼
   ECR  myapp:<tag>       CloudWatch  /ecs/myapp
```

| file | contains |
|---|---|
| `provider.tf` | Terraform + AWS provider config, S3 backend, account guard, default tags |
| `variables.tf` | every input, all with defaults |
| `network_provisioning.tf` | VPC, internet gateway, 2 subnets, route table, associations |
| `security_groups.tf` | `myapp-alb-sg`, `myapp-task-sg` |
| `alb.tf` | load balancer, target group, listener |
| `ecs.tf` | ECR repo, log group, execution role, cluster, task definition, service |
| `outputs.tf` | ALB URL, ECR URI, and the names `cd.yml` needs |
| `backend.personal.hcl` | the state bucket, supplied at `init` |
| `Makefile` | optional shortcuts — see [Makefile](#makefile-optional) |

Every resource name is prefixed by `var.project`, which defaults to `myapp`.
Change it there if you want different names.

---

## Why the first apply needs a bootstrap

`terraform apply` on its own leaves a broken service, and it is not a mistake:

```
terraform apply
   ├── creates ECR repository       → EMPTY
   └── creates ECS service pointing at myapp:bootstrap
                                            ↑
                                    does not exist yet

   tasks → PROVISIONING → CannotPullContainerError → retry → forever
   curl  → 503 Service Temporarily Unavailable   (ALB up, no healthy target)
```

The registry and the thing that consumes it are born in the same apply. Steps 5
and 6 of the quickstart resolve it by hand.

Production pipelines avoid it instead — by pointing the first task definition at
a public placeholder image, or creating the service at `desired_count = 0`, or
running the app pipeline before the infra pipeline. Doing it manually once is
honest for day one of a new stack, and it never happens again.

---

## Day 2: deploying a code change

Once the platform exists, **Terraform is no longer involved in deploys.**

Edit `apps/node-ecs-service/server.js`, push a branch, open a PR:

```
open a PR
   └── ci.yml runs
       builds the image and throws it away
       answers one question: "will this still build?"
       has no AWS credentials at all

add the "deploy" label to the PR         ← deploy from a branch, before merging
   └── cd.yml runs
       1. OIDC → assumes github-actions-ecs-deploy, gets ~1h credentials
       2. docker build + push       myapp:<commit-sha>
       3. reads the LIVE task definition, swaps only the image field
       4. registers a new revision  myapp:N+1
       5. updates the service, waits for stability
       6. comments the deployed URL on the PR

merge to main
   └── cd.yml runs again, same steps, from main
```

Watch it land: **ECR** → a new row tagged with the commit SHA; **ECS** → Task
definitions → a new revision; **Deployments** tab → `PRIMARY` (new) alongside
`ACTIVE` (old) until the rollout completes.

### Why the two do not fight

Both Terraform and `cd.yml` want to write the task definition:

```
┌──────────────────────────────────────────────┐
│ TASK DEFINITION myapp:N                      │
│                                              │
│   cpu, memory                  ← TERRAFORM   │
│   execution role               ← TERRAFORM   │
│   log configuration            ← TERRAFORM   │
│   port mappings                ← TERRAFORM   │
│                                              │
│   image  myapp:<commit-sha>    ← CI/CD       │
└──────────────────────────────────────────────┘
```

The rule is two lines in `ecs.tf`:

```hcl
lifecycle {
  ignore_changes = [task_definition, desired_count]
}
```

**Terraform owns the platform. CI owns the image.** Terraform points the service
at a revision exactly once, at creation, then never looks at it again. Without
this, the next `terraform apply` would drag a live service back to revision 1.

`desired_count` is ignored for the same reason: a scale-up during an incident
should survive the next apply.

### Rolling back

The image tag is the commit SHA and ECR tags are immutable, so every past deploy
is still addressable. Point the service at an older revision:

```bash
aws ecs update-service --cluster myapp-cluster --service myapp-service \
  --task-definition myapp:5 --region us-east-1
```

Seconds, and it stops the bleeding. Then `git revert` the bad commit so the
repository matches reality. In that order.


#### WHERE TO LOOK - AWS CONSOLE

ECS > Clusters > myapp-cluster > Services tab > Select checkbox "myapp-service"
Click button "Update"
Then:
```
 Deployment configuration
  ├─ Task definition
  │     Family    myapp
  │     Revision  ▼  ← THE DROPDOWN. pick the older revision, e.g. 5 instead of 7
  │
  └─ Force new deployment

  →  Update  (bottom right)

```
---

## Everyday commands

```bash
terraform plan                          # preview
terraform apply                         # build or update
terraform output                        # ALB URL, ECR URI, resource names
terraform destroy                       # tear down

aws logs tail /ecs/myapp --follow --region us-east-1
```

### Makefile (optional)

The `make` targets wrap exactly these commands — nothing more. Use Terraform
directly if you prefer. The Makefile exists so `make bootstrap` can chain
quickstart steps 3–5 into one command, and so someone new to the repo can run
`make` and see what this directory does.

```bash
make              # list targets
make bootstrap    # steps 3-5 in one command (first apply only)
```

---

## Decisions worth knowing

| Decision | Why |
|---|---|
| Public subnets, `assign_public_ip = true` | A Fargate task in a private subnet cannot reach ECR without a NAT Gateway (~$32/mo) or three VPC endpoints. The tasks are still unreachable directly — only the ALB's security group is allowed in. |
| `target_type = "ip"` | `awsvpc` gives each task its own ENI and private IP. There is no EC2 instance to register. |
| Task SG sources the ALB SG, not a CIDR | Task IPs change on every deploy. A CIDR rule would be either wrong or far too wide. |
| `image_tag_mutability = "IMMUTABLE"` | A tag can never be overwritten, so an old commit SHA stays a valid rollback target. `:latest` has no address to roll back *to*. |
| `deployment_circuit_breaker` enabled | Not enabled by default through the API — only the console wizard sets it. Without it a broken deploy retries forever instead of rolling back. |
| `minimum_healthy_percent = 100` | ECS may not stop a healthy task until its replacement passes the health check. A bad deploy cannot take the service down. |
| No task role | The app makes no AWS API calls, so it gets no AWS identity. The **execution role** is a different thing: that is the ECS agent pulling the image and writing logs. |
| Log group created by Terraform | `AmazonECSTaskExecutionRolePolicy` does not include `logs:CreateLogGroup`. Creating it here avoids needing that permission. `awslogs-create-group` is omitted entirely — ECS rejects `"false"`. |
| ALB deletion protection off, ECR `force_delete` on | So `terraform destroy` actually works. Both would be the opposite in production. |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `503 Service Temporarily Unavailable` | ALB is up but has no healthy target. Check the tasks, then CloudWatch logs. |
| `curl` times out — no response at all | Security group problem; nothing is reachable at the network level. A completely different layer from a 503. |
| `CannotPullContainerError` | The tag in the task definition does not exist in ECR. |
| `exec format error` in the logs | Image built for arm64. Rebuild with `--platform linux/amd64`. |
| Tasks start, then cycle forever | Health check failing. Confirm the path returns 200 and the app binds `0.0.0.0`, not `127.0.0.1`. |
| `Error: AWS Account ID not allowed` | Your credentials belong to a different account than `var.aws_account_id`. Working as intended. |

---

## Teardown

```bash
cd infra/ecs-fargate
terraform destroy
```

Type `yes`. Takes ~3 minutes; the load balancer is the slow part. Removes all 17
resources **including the ECR repository and every image in it** (`force_delete`).

Verify nothing is left billing:

```bash
aws elbv2 describe-load-balancers --region us-east-1 --query 'LoadBalancers[].LoadBalancerName'
aws ecs list-clusters          --region us-east-1
aws ecr describe-repositories  --region us-east-1 --query 'repositories[].repositoryName'
```

All three should come back empty.

**Not destroyed, and free:** the S3 state bucket, and ECS task definition
revisions. Note that revisions registered before a teardown point at images that
no longer exist, so they stop being valid rollback targets once the ECR
repository is deleted.

**Cost while running:** roughly **$0.75/day** — ALB ~$0.55, two 0.25 vCPU /
0.5 GB Fargate tasks ~$0.20, plus cents for ECR storage and CloudWatch.
