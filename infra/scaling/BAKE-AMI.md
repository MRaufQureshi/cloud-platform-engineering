# Bake the golden AMI

**Do this before `terraform apply`.** It is the only manual step in this stack — everything else is Terraform.

~10 minutes, mostly waiting.

---

## Why it isn't in Terraform

The ASG launches instances from an image that already has the web server installed. Baking that image means booting a machine, configuring it, and snapshotting the result — a one-off act, not desired state, so Terraform is the wrong tool for it.

An AMI ID also belongs to **one account in one region**. Current one is useless, which is why `var.ami_id` has no default.

```
you (once)          bake an AMI        →  ami-0abc123...
terraform.tfvars    ami_id = "ami-0abc123..."
terraform apply     launch template → ASG → instances
```

---

## 1. Launch a source instance

**EC2 → Instances → Launch instances**

| | |
|---|---|
| Name | `WebServer` |
| AMI | Amazon Linux 2023 |
| Instance type | `t3.micro` |
| Key pair | yours, from [PREREQUISITES.md §5](../../PREREQUISITES.md) |
| VPC | the one `core` created |
| Subnet | a **public** one |
| Auto-assign public IP | Enable |
| Security group | existing → `private-instance-sg` |

**Advanced details → User data:**

```bash
#!/bin/bash
dnf update -y
dnf install -y httpd stress
systemctl enable --now httpd
echo "<h1>WebServer OK</h1>" > /var/www/html/index.html
```

`stress` is there so you can load-test the ASG later.

## 2. Check it actually works

Wait ~2 minutes for status checks, then open `http://<public-ip>/index.html`. You should see **WebServer OK**.

Don't skip this. Baking a broken instance gives you a broken image, and you find out later when the ASG cycles instances forever.

## 3. Create the image

**Select the instance → Actions → Image and templates → Create image**

| | |
|---|---|
| Image name | `WebServerAMI` |

The instance reboots briefly for filesystem consistency. Expected.

## 4. Wait for it, then copy the ID

**EC2 → AMIs** — wait for Status `Available`, then copy the AMI ID:

```
ami-0abc123def456789
```

## 5. Put it in Terraform

```hcl
# infra/scaling/terraform.tfvars      # gitignored
ami_id       = "ami-0abc123def456789"
state_bucket = "your-terraform-state-bucket"
```

## 6. Terminate the source instance

You only needed its disk. The AMI and its snapshot survive termination.

```
EC2 → Instances → WebServer → Instance state → Terminate
```

---

## Now run Terraform

```bash
cd infra/scaling
terraform apply
```

If you skip the bake and you get:

```
Error: InvalidAMIID.NotFound
```

## When you're finished with the stack

`terraform destroy` does **not** remove the AMI. Delete it by hand or it bills quietly:

```
EC2 → AMIs      → select → Deregister AMI
EC2 → Snapshots → select → Delete
```
