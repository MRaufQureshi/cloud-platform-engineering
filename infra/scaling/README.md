# scaling

An Auto Scaling Group behind an Application Load Balancer, built on top of `core`'s VPC. Instances launch from a **golden AMI you bake yourself** and scale on CPU.

---

## What you'll learn

- **Golden AMI** — bake a server once, launch it a hundred times, no boot-time installs
- **Launch template + ASG + scaling policy** — the three pieces, and what each decides
- **Target tracking** — "keep average CPU near 30%" instead of hand-written rules
- **`health_check_type = "ELB"`** — replace instances the load balancer calls unhealthy, not just ones that stopped
- **Reading another stack's state** — `terraform_remote_state`, one-way and read-only

## What's implemented

- Launch template from your custom AMI
- ASG across both private subnets, 2–4 instances, target tracking at 30% CPU
- ALB + target group + listener, health checking `/index.html`
- A "scaling host" in a public subnet for running load tests
- IAM role with SSM access and the EC2 permissions for baking an AMI

---

## Architecture

<details>
<summary>Click to expand</summary>

![Scaling Architecture Diagram](architecture.png)

</details>

---

## Prerequisites

| | |
|---|---|
| `infra/bootstrap` applied | this stack's state lives in that bucket |
| `infra/core` applied | it reads core's VPC, subnets and security groups |
| An EC2 key pair | [PREREQUISITES.md §5](../../PREREQUISITES.md) |
| **A golden AMI** | **you have to bake it — see below** - **Do this before `terraform apply`.** |

### Bake the AMI first — the one manual step

Everything in this stack is Terraform **except** the image the ASG launches from. Baking an image is a one-off act, not desired state, and an AMI ID belongs to one account in one region — so `var.ami_id` has no default and you build your own.

**→ [BAKE-AMI.md](BAKE-AMI.md)** — ~10 minutes, then put the ID in
`terraform.tfvars`.

Skip it and `apply` fails with `InvalidAMIID.NotFound`.


---

## Run it

```bash
cd infra/scaling

cp backend.lab.hcl.example backend.lab.hcl
cp terraform.tfvars.example terraform.tfvars
# edit both: your state bucket, and your AMI ID

terraform init -backend-config=backend.lab.hcl
terraform apply
```

Both copied files are gitignored — they name a bucket and an AMI that exist only in your account.

### Check it

```bash
terraform output alb_dns_name
curl "http://$(terraform output -raw alb_dns_name)/index.html"   # WebServer OK
```

The target group needs a minute before the first instance is healthy. Until then the ALB returns `503` — that means "no healthy target", not "broken".

### Watch it scale

```bash
# ssh to the scaling host, then load one ASG instance
stress --cpu 2 --timeout 600
```

CPU crosses 30%, the policy adds instances up to 4, and they drop back to 2 when it settles. Alarms take ~3 minutes to trigger either way.

---

## How it's wired

This stack creates **no** networking. It borrows all of it from `core`:

```
core's state  ──read──▶    scaling
  vpc_id                   target group
  public_subnet  × 2       ALB
  private_subnet × 2       ASG instances
  private_instance_sg      ALB + ASG instances
  allow_ssh_sg             scaling host
  ec2_host_sg              scaling host
```

Two state files, one bucket:

```
core/terraform.tfstate       owned by core
scaling/terraform.tfstate    owned by this stack
```

Separate keys mean separate locks, so a bad apply here cannot touch the VPC.

---

## Teardown

```bash
terraform destroy
```

Takes ~3 minutes; the ALB is the slow part. The ASG terminates its instances first, so nothing is orphaned.

Your golden AMI is **not** destroyed — it was created outside Terraform. Delete it by hand from EC2 → AMIs, and its snapshot from EC2 → Snapshots, or it bills quietly forever.

---

## Cost

| | |
|---|---|
| ALB | ~$0.55/day |
| 2–4 × `t3.micro` in the ASG | ~$0.50–1.00/day |
| 1 × `t3.micro` scaling host | ~$0.25/day |
| AMI snapshot storage | a few cents/month |

Roughly **$1.30–1.80/day** — the most expensive stack in this repo. Destroy it when you're done for the day.

> Prices change and vary by region. Check the
> [AWS pricing calculator](https://calculator.aws) — these are a reference
> point, not a quote.
