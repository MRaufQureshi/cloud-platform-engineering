# theo

**Step 3 of 3.** The platform itself. Remote state in the bucket from step 2.

Phase 0 (current): provider, S3 backend, account guard. No resources yet —
`terraform plan` shows only outputs. Modules are added phase by phase; see
[capstone/README.md](../../README.md).

## Run it

```bash
cd capstone/infra/theo
cp backend.lab.hcl.example backend.lab.hcl     # put your bucket in it
terraform init -backend-config=backend.lab.hcl
terraform plan
```

Or from the repo root: `make -C capstone init plan`.

From CI: **Actions → THEO Infra Run → plan/apply/destroy**.
Destroy needs the confirmation text `destroy-theo`.

## Testing Phase 2 (IoT + simulator)

The simulator box takes about 2 minutes after `apply` to install everything and start.

```bash
# 1. Is the box up and reachable by SSM? (shows "Online")
aws ssm describe-instance-information --query 'InstanceInformationList[].PingStatus' --output text

# 2. Telemetry rows arriving from the three devices?
aws dynamodb scan --table-name theo-telemetry --select COUNT
aws dynamodb get-item --table-name theo-device-state --key '{"device_id":{"S":"device-1"}}'

# 3. Send a plug-in command, as the API will later (needs the AWS CLI's iot-data)
aws iot-data publish --topic theo/device-1/control \
  --cli-binary-format raw-in-base64-out --payload '{"cmd":"plug_in"}'

# 4. Watch the device react: run a command on the box and read the simulator log
aws ssm send-command --instance-ids <simulator_instance_id> \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["journalctl -u theo-simulator -n 20 --no-pager"]'
# then: aws ssm get-command-invocation --command-id <id> --instance-id <id> --query StandardOutputContent --output text
```

Interactive shell instead (needs the Session Manager plugin):
`aws ssm start-session --target <simulator_instance_id>`.
If rows do not appear, check the rule error log group: `aws logs tail /theo/iot-rule-errors`.

## Testing Phase 3 (optimizer)

```bash
make -C capstone apply            # creates the queue, ECR repo, cluster, service (the task cannot start yet: no image)
make -C capstone seed-optimizer   # build + push :bootstrap, restart the service, wait until stable

# the whole chain: plug in -> event -> SQS -> optimizer -> schedule -> device
aws iot-data publish --topic theo/device-2/control --cli-binary-format raw-in-base64-out --payload '{"cmd":"plug_in"}'
make -C capstone optimizer-logs                                  # "[device-2] plug_in: 54 slots, saved EUR ..."
aws dynamodb query --table-name theo-schedules --key-condition-expression 'device_id = :d' \
  --expression-attribute-values '{":d":{"S":"device-2"}}' --select COUNT
aws dynamodb query --table-name theo-savings --key-condition-expression 'device_id = :d' \
  --expression-attribute-values '{":d":{"S":"device-2"}}'
```
Then watch the car obey: the simulator log shows `new schedule: 54 slots`, and `theo-device-state.soc` drifts down in the evening peak and up overnight.

Prove the task is private: `aws ecs describe-tasks ...` shows no public IP, yet the service reaches ECR, SQS and IoT.
Prove retries work: send a message for a device that never sent telemetry (`aws sqs send-message ... '{"device_id":"device-9","reason":"test"}'`). It fails, retries, and after 3 attempts appears in `theo-replan-dlq`.

## Testing Phase 4 (prices)

```bash
make -C capstone apply                                       # creates the schedule + 2 Lambdas
aws lambda invoke --function-name theo-price-fetcher --cli-binary-format raw-in-base64-out /dev/stdout
# {"source": "awattar", "rows": ..., "devices": [...]}

aws dynamodb query --table-name theo-prices --key-condition-expression '#d = :d' \
  --expression-attribute-names '{"#d":"date"}' --expression-attribute-values '{":d":{"S":"latest"}}' --select COUNT
aws s3 ls s3://theo-data-<account>/prices/                   # the raw JSON
aws logs tail /aws/lambda/theo-price-fetcher --since 5m      # "wrote N price rows from awattar; asked 3 device(s) to re-plan"
aws events describe-rule --name theo-daily-prices --query ScheduleExpression
```
Before 13:00 UTC aWATTar returns only part of a day, so `latest` is not written; that is
intended. After the first 13:05 run, `latest` holds a complete day.
Redeploy the optimizer after this phase (`make -C capstone deploy-optimizer`, or merge to `main`): it now prefers real prices.

## Troubleshooting

| Error | Meaning |
|---|---|
| `AWS Account ID not allowed` | credentials belong to a different account than `var.aws_account_id` |
| `Backend initialization required` | run `make -C capstone init` |
| `NoSuchBucket` on init | step 2 not done, or the lab was wiped; repeat steps 1 and 2 |
