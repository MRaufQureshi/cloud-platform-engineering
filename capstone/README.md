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
**Actions → T.H.E.O. Infra Run**.

Step 1 cannot run in CI: it creates the very access CI needs. After a lab wipe,
delete the leftover `terraform.tfstate` in `infra/prerequisites/` and
`infra/bootstrap/`, then repeat steps 1 and 2.

---

## Logging in to the demo

The login is Amazon Cognito. Terraform creates one demo user and a random one-time password.

```bash
cd capstone/infra/theo
terraform output demo_username                       # admin@theo.demo
terraform output -raw demo_temporary_password        # only shown on request, never in git
```

At the first login Cognito makes you choose a new password (the web app shows that screen).
After a lab wipe and rebuild the user is new again, so repeat the two commands above.

**Testing the API from a terminal?** Do not set a password on the demo user: its one-time
password would stop working. Use a throwaway user and delete it afterwards. The exact
commands are in [infra/theo/README.md](infra/theo/README.md) under "Testing Phase 5".

## The morning after a lab wipe

The lab account removes parts of the stack overnight (and the 13:05 price schedule
has not run yet at 9:00). To bring the demo back, in this order:

| # | Step | Command | Why |
|---|---|---|---|
| 1 | Check which account you are in | `make -C capstone check-account` | must print the lab account |
| 2 | See what is missing | `make -C capstone plan` | a wipe shows as "has been deleted" + additions, no destroys |
| 3 | Rebuild | `make -C capstone apply` (or **Actions → T.H.E.O. Infra Run → apply**) | ~10 min, mostly the NAT gateway |
| 4 | Put the optimizer image back (only if the ECR repo was wiped) | `make -C capstone seed-optimizer` | an empty repository cannot start the task |
| 5 | Fetch prices (optional) | `make -C capstone prices` | the daily schedule only fires at 13:05 UTC; without prices the optimizer uses a typical day |
| 6 | Get the demo login | `cd capstone/infra/theo && terraform output demo_username && terraform output -raw demo_temporary_password` | a wipe recreates the login pool, so the demo user and its one-time password are NEW every rebuild |
| 7 | Wait ~3 minutes, then plug a car in | `aws iot-data publish --topic theo/device-1/control --cli-binary-format raw-in-base64-out --payload '{"cmd":"plug_in"}'` | the simulator box needs that long to boot |

If `prerequisites` or `bootstrap` were wiped too (the OIDC roles or the state bucket
are gone), repeat steps 1 and 2 of the Quickstart first.

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
| 3 | optimizer (ECS Fargate, HiGHS) + SQS + Rule B + T.H.E.O. App Deploy | done (12 resources) |
| 4 | prices (EventBridge + Lambda) + forecast stub | done (12 resources) |
| 5 | API + auth (Cognito, API Gateway JWT, API Lambda) | done (22 resources) |
| 6 | frontend (CloudFront) | |
| 6b | landing page: ECS Fargate (private subnets) behind an ALB, HTTP, with an "Optimizer" button to the React login | |
| 7 | observability + security | |
| 8 | demo polish + destroy rehearsal | |

## Deliberately excluded

Route53 / custom domain / failover (to be learned separately; CloudFront's own
domain is used), multi-region, EKS, Kinesis, Step Functions, Timestream.
