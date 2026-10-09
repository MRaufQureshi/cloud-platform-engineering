# T.H.E.O. capstone

An IoT energy-optimizer platform on AWS, built with Terraform and deployed
through GitHub Actions. Virtual smart-home boxes (EV + solar + meter) talk to
AWS IoT Core; a cloud optimizer schedules EV charging and discharging against
hourly electricity prices; a React dashboard behind Cognito shows the savings.

The business case and research behind it are in [T.H.E.O.md](T.H.E.O.md). The
topology is in [T.H.E.O.ARCHITECTURE.md](T.H.E.O.ARCHITECTURE.md) and the build
order in [T.H.E.O.BUILD.SPEC.md](T.H.E.O.BUILD.SPEC.md).

> Builds in the **lab account (464447071956)**, us-east-1. The lab wipes itself,
> so everything below is repeatable from scratch.

---

## Quickstart

**Prerequisites:** Terraform ≥ 1.10, AWS CLI v2 with lab credentials,
`make`. Docker and Node arrive in the phases that need them.

```bash
make -C capstone check-account   # must print 464447071956
```

Three steps, always in this order:

| Step | Command | What it makes | State |
|---|---|---|---|
| 1 | `make -C capstone prerequisites` | GitHub OIDC provider + CI roles | local |
| 2 | `make -C capstone bootstrap` | S3 bucket for Terraform state | local |
| 3 | `make -C capstone init apply` | THEO itself | S3 |

Steps 1 and 2 print the exact follow-up commands (the `gh variable set` lines
and the `backend.lab.hcl` line). The full checklist, including the three GitHub
Variables, is in [PREREQUISITES.md](PREREQUISITES.md). Step 3 can also run from GitHub:
**Actions → THEO Infra Run**.

Step 1 cannot run in CI: it creates the very access CI needs. After a lab wipe,
delete the leftover `terraform.tfstate` in `infra/prerequisites/` and
`infra/bootstrap/`, then repeat steps 1 and 2.

---

## Layout

```
capstone/
├── infra/
│   ├── prerequisites/   step 1: OIDC provider + CI roles
│   ├── bootstrap/       step 2: state bucket
│   └── theo/            step 3: the platform (modules/ added phase by phase)
└── apps/                simulator, optimizer, lambdas, frontend, observability
```

## Build phases

| Phase | Adds | Status |
|---|---|---|
| 0 | prerequisites, bootstrap, `theo` skeleton, CI hooks | done |
| 1 | network + data | done (48 resources) |
| 2 | IoT + simulator | done (33 resources) |
| 3 | optimizer (ECS Fargate, HiGHS) + SQS + Rule B + THEO App Deploy | done (12 resources) |
| 4 | prices (EventBridge + Lambda) | |
| 5 | API + auth (Cognito) | |
| 6 | frontend (CloudFront) | |
| 6b | landing page: ECS Fargate (private subnets) behind an ALB, HTTP, with an "Optimizer" button to the React login | |
| 7 | observability + security | |
| 8 | demo polish + destroy rehearsal | |

## Deliberately excluded

Route53 / custom domain / failover (to be learned separately; CloudFront's own
domain is used), multi-region, EKS, Kinesis, Step Functions, Timestream.
