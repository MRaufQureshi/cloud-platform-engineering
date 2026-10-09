# bootstrap

**Step 2 of 3.** Creates the S3 bucket that holds the `theo` stack's Terraform
state. Local state; run once.

## What you'll learn
- Why remote state exists, and the chicken-and-egg of creating its bucket
- S3-native state locking (`use_lockfile`), which replaces a DynamoDB lock table
- Why versioning and a public-access block matter for state files

## Run it

```bash
make -C capstone bootstrap
```

The bucket is named `theo-tfstate-<account-id>-us-east-1` unless you override
`bucket_name`. The command prints how to use it:

```bash
echo 'bucket = "theo-tfstate-…"' > capstone/infra/theo/backend.lab.hcl   # local
gh variable set THEO_STATE_BUCKET --body "theo-tfstate-…"             # CI
```

## What it builds

| Resource | Why |
|---|---|
| S3 bucket | holds `theo/terraform.tfstate` and its lock file |
| versioning | every state revision is kept and recoverable |
| AES256 encryption | state can contain secrets |
| public-access block | never public |

`force_destroy = true` so `terraform destroy` can empty and delete the bucket.
In production you would not set this.

## After a lab wipe
Delete the leftover `terraform.tfstate` here, then run the step again.
