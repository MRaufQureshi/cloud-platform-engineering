# Prerequisites — do this before cloning or running anything

Three things must exist in your AWS account **before** any Terraform in this
repo will work end to end. They are deliberately **not** managed by Terraform,
and the reasoning is at the [bottom](#why-these-are-not-in-terraform).

| # | What | Where | How often |
|---|---|---|---|
| 1 | GitHub OIDC identity provider | IAM | once per AWS account, ever |
| 2 | `github-actions-ecs-deploy` role + `ecs-deploy` inline policy | IAM | once per repo |
| 3 | `AWS_ROLE_ARN` repository variable | GitHub | once per repo |

Total: about ten minutes. After that, every stack in `infra/` is
`terraform apply` and every deploy is a `git push`.

---

## 1. Register GitHub as an identity provider

This tells AWS "tokens signed by GitHub's key are ones I am willing to
*consider*". Consider, not trust — trust is decided in step 2.

### Console

**IAM → Identity providers → Add provider**

| | |
|---|---|
| Provider type | OpenID Connect |
| Provider URL | `https://token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |

### CLI

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

### Verify

```bash
aws iam list-open-id-connect-providers
# arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com
```

One per account. If it already exists, skip — a second one cannot be created.

---

## 2. Create the deploy role

This is the identity GitHub Actions assumes. No access keys are ever stored
anywhere.

### Console

**IAM → Roles → Create role → Web identity**

| | |
|---|---|
| Identity provider | `token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |
| GitHub organisation | your org |
| GitHub repository | your repo |
| GitHub branch | leave blank |

Skip permissions for now. Name it **`github-actions-ecs-deploy`** → Create.

Then **Trust relationships → Edit trust policy** and replace the `sub`
condition, because the console writes the *name-based* pattern and GitHub sends
*ID-based* claims:

```json
"StringLike": {
  "token.actions.githubusercontent.com:sub":
    "repo:<GIT_NAME>@<GIT_ACCOUNT_ID>/<GIT_REPO>g@<REPO_ID>:*"
}
```

> **This single line is the security boundary of the entire pipeline.** Omit the
> condition, or write `repo:*`, and any GitHub repository on earth — including
> one an attacker creates in thirty seconds — can assume this role and get
> credentials into your AWS account.
>
> The numbers are not decoration. `123456` is the GitHub account ID and
> `12345` is the repository ID; both are immutable. Names are reclaimable:
> delete a repo, someone else registers the name, and their OIDC token now
> carries the same name-based `sub` as yours. Same reasoning as pinning an image
> digest instead of a tag.
>
> **Find your own IDs** from a failed run — the error prints the `sub` GitHub
> sent:
> ```
> Not authorized to perform sts:AssumeRoleWithWebIdentity
> sub: repo:YourOrg@12345678/your-repo@87654321:pull_request
> ```

Then **Add permissions → Create inline policy → JSON**, name it **`ecs-deploy`**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrAuthToken",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPushPull",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "arn:aws:ecr:us-east-1:<ACCOUNT_ID>:repository/myapp"
    },
    {
      "Sid": "EcsTaskDefinition",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition"
      ],
      "Resource": "*"
    },
    {
      "Sid": "EcsDeploy",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:UpdateService"
      ],
      "Resource": "arn:aws:ecs:us-east-1:<ACCOUNT_ID>:service/myapp-cluster/myapp-service"
    },
    {
      "Sid": "PassExecutionRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/myapp-ecs-execution-role",
      "Condition": {
        "StringEquals": { "iam:PassedToService": "ecs-tasks.amazonaws.com" }
      }
    },
    {
      "Sid": "ReadLoadBalancer",
      "Effect": "Allow",
      "Action": "elasticloadbalancing:DescribeLoadBalancers",
      "Resource": "*"
    }
  ]
}
```

Replace `<ACCOUNT_ID>`, and `myapp` if you changed `var.project`.

### What each statement is for

| Sid | pipeline step | scope |
|---|---|---|
| `EcrAuthToken` | `docker login` | must be `*` — account-level, AWS allows nothing narrower |
| `EcrPushPull` | `docker push` | this one repository |
| `EcsTaskDefinition` | read the live task def, register a new revision | must be `*` — these calls have no resource-level support |
| `EcsDeploy` | point the service at the new revision | this one service |
| `PassExecutionRole` | registering a task def hands a role to ECS | that one role, only to ECS |
| `ReadLoadBalancer` | the verify step looks up the ALB's DNS name | `*` |

**`iam:PassRole` is the one everyone misses.** Registering a task definition
means telling ECS "use this role for the task", and AWS treats handing a role to
a service as privilege escalation — otherwise anyone who can create a task could
attach an admin role to it. Without it the deploy fails with
`is not authorized to perform: iam:PassRole`, which reads like a bug and is
working exactly as designed.

**Why the execution-role ARN is safe to hardcode here.** Terraform names it
`${var.project}-ecs-execution-role`, deterministically. Destroy and rebuild
`infra/ecs-fargate` as often as you like and the ARN is identical, so this
policy never goes stale. (It did once, when that role was console-created with a
random name — which is what motivated writing this down.)

### CLI

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
SUB='repo:MRaufQureshi@65447872/cloud-platform-engineering@1378650886:*'

cat > /tmp/trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "${SUB}" }
    }
  }]
}
EOF

aws iam create-role \
  --role-name github-actions-ecs-deploy \
  --assume-role-policy-document file:///tmp/trust.json

# save the JSON policy above to /tmp/ecs-deploy.json, with <ACCOUNT_ID> replaced
aws iam put-role-policy \
  --role-name github-actions-ecs-deploy \
  --policy-name ecs-deploy \
  --policy-document file:///tmp/ecs-deploy.json
```

### Verify

```bash
aws iam get-role --role-name github-actions-ecs-deploy \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition' --output json
```

---

## 3. Tell GitHub which role to assume

**Repo → Settings → Secrets and variables → Actions → Variables → New variable**

| | |
|---|---|
| Name | `AWS_ROLE_ARN` |
| Value | `arn:aws:iam::<ACCOUNT_ID>:role/github-actions-ecs-deploy` |

A **Variable**, not a Secret. An ARN is an identifier, not a credential — it
grants nothing on its own, and keeping it readable means a failed run is
diagnosable instead of showing `***`.

`.github/workflows/cd.yml` reads it as `${{ vars.AWS_ROLE_ARN }}`.

---

## Then

```bash
cd infra/ecs-fargate
terraform init -backend-config=backend.personal.hcl
terraform apply
```

See [`infra/ecs-fargate/README.md`](infra/ecs-fargate/README.md) for the rest,
including the first-image bootstrap.

---