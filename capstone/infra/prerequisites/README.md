# prerequisites

**Step 1 of 3.** Creates the identities GitHub Actions uses to reach the lab
account: the OIDC provider and two roles. Run once from your laptop, with local
state.

## What you'll learn
- How GitHub OIDC replaces stored AWS keys
- Why the `sub` condition in a trust policy is the security boundary
- Why CI's own access must live outside the stack it deploys

## Run it

```bash
make -C capstone check-account    # must print 464447071956
make -C capstone prerequisites
```

It prints two `gh variable set` lines. Run them (or add the variables in GitHub →
Settings → Secrets and variables → Actions → Variables):

| Variable | Role | Used by |
|---|---|---|
| `AWS_THEO_ROLE_PLAN` | `github-actions-theo-terraform-plan` (read-only) | pull-request plans |
| `AWS_THEO_ROLE_APPLY` | `github-actions-theo-terraform-apply` | T.H.E.O. Infra Run apply/destroy |

## What it builds

| Resource | Purpose |
|---|---|
| OIDC provider | tells AWS to consider tokens signed by GitHub |
| plan role | `ReadOnlyAccess`; assumable by pull requests and `main` |
| apply role | `PowerUserAccess` + IAM management; assumable from `main` only |

The apply role is effectively admin, because THEO creates IAM roles. That is
acceptable in a throwaway lab account with the trust policy locked to `main`;
production would add a permissions boundary.

## After a lab wipe
The account resets but this folder's `terraform.tfstate` does not. Delete it,
then run the step again.

## Troubleshooting

| Error | Meaning |
|---|---|
| `AWS Account ID not allowed` | wrong credentials; the guard is working |
| `EntityAlreadyExists` on the OIDC provider | the account already has one; swap the resource for a `data` lookup |
| CI: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | the `sub` printed in the error does not match `github_org_id` / `github_repo_id` in `variables.tf` |
