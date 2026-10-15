# cloud-platform-engineering

Hands-on AWS platform engineering, built with Terraform and deployed through GitHub Actions. Each folder is a small, working stack with its own README that explains what it builds and what you learn from it. The repo ends in a capstone: an IoT energy optimizer called **T.H.E.O.**

> Built and tested in `us-east-1`. It is a learning project, not production code: defaults favour low cost and easy teardown.

## The capstone: T.H.E.O.

Virtual smart homes (EV, solar, smart meter) send data to AWS IoT Core. A cloud optimizer plans when to charge or discharge the car against hourly electricity prices, and a web app behind a login shows the savings. It comes with a landing site, Grafana dashboards, alarms and a CI/CD pipeline.

**Start here:** [capstone/README.md](capstone/README.md). It has the quickstart, the demo login and a checklist for rebuilding after a lab wipe.

## The stacks

| Folder | What it builds | What you learn |
|---|---|---|
| [`infra/bootstrap`](infra/bootstrap) | S3 bucket for Terraform state | Remote state and the chicken-and-egg problem |
| [`infra/core`](infra/core) | VPC, bastion, private EC2, monitoring, CloudTrail | What makes a subnet public, bastion vs Instance Connect |
| [`infra/scaling`](infra/scaling) | Auto Scaling Group behind an ALB, from a golden AMI | Launch templates, target tracking, health checks |
| [`infra/rds`](infra/rds) | Aurora MySQL in private subnets | Reachability by security group, secrets out of Terraform |
| [`infra/ecs-fargate`](infra/ecs-fargate) | VPC, ALB and an ECS Fargate service | Containers on AWS with no servers to manage |
| [`infra/ansible`](infra/ansible) | Playbooks for the private EC2 | Terraform builds the server, Ansible configures it |
| [`capstone`](capstone) | The T.H.E.O. platform (11 Terraform modules) | Everything above, combined and more |

Stacks `scaling` and `rds` read `core`'s state, so apply `core` first. `ecs-fargate` and `capstone` stands alone.

## Before you run anything

Some identities (the GitHub OIDC provider, CI roles) must exist before Terraform runs. They are deliberately not managed by Terraform. Read [PREREQUISITES.md](PREREQUISITES.md) first.

You need Terraform 1.10 or newer, the AWS CLI v2 and credentials for the account you are targeting. Docker and Node arrive in the stacks that use them.

## CI/CD

GitHub Actions authenticates to AWS with OIDC, so no keys are stored in the repo. Workflows check formatting, validate and plan on pull requests, and apply or destroy only on request from `main`.

## Cost

Everything here creates billable resources. Destroy a stack when you finish (`terraform destroy`, or the destroy option in the matching workflow). The capstone costs roughly $0.26 an hour while running, which is an estimate from list prices, not a quote.

# Diagrams at glance: Architecture + Infrastructure

## Capstone

<details>
<summary>Click to view capstone details</summary>

![Infra](/capstone/theo-architecture-figure-8-16x9.png)

![Network](/capstone/theo-fig2-network.png)

![ObsAndSG](/capstone/theo-fig6-observability-security.png)

![SG](/capstone/theo-fig3-security-groups.png)

![IoT](/capstone/theo-fig5-control-loop.png)

</details>

## Github Delivery

<details>
    <summary>Click to view CICD details</summary>

![Infra](/caps-delivery.png)

</details>

&nbsp;

# Diagrams at glance: Infra folder - What to expect

## Infra

<details>
<summary>Click to view Core details</summary>

![Core](/infra/core/architecture.png)

![RDS](/infra/rds/rds.png)

![Scale](/infra/scaling/scaling.png)

![ECS-Fargate](/infra/ecs-fargate/architecture.png)

</details>