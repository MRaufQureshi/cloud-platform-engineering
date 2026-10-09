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

From CI: **Actions → T.H.E.O. Infra Run → plan/apply/destroy**.
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

## Testing Phase 5 (login + API)

```bash
make -C capstone apply
cd capstone/infra/theo
API=$(terraform output -raw api_url); POOL=$(terraform output -raw cognito_user_pool_id); CLIENT=$(terraform output -raw cognito_client_id)

# 1. No token = refused by API Gateway (the Lambda never runs)
curl -s -o /dev/null -w "%{http_code}\n" $API/device/device-1/status        # 401

# 2. Get a token. The demo user must pick a new password at first login (the React app
#    does that for you), and its one-time password is a Terraform output: setting a
#    password on it from the CLI would break that. So use a THROWAWAY user and delete it (step 4):
aws cognito-idp admin-create-user --user-pool-id $POOL --username tester@theo.demo --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id $POOL --username tester@theo.demo --password 'Throwaway-Pass-123!' --permanent
TOKEN=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id $CLIENT \
  --auth-parameters USERNAME=tester@theo.demo,PASSWORD='Throwaway-Pass-123!' --query AuthenticationResult.IdToken --output text)

# 3. Call it
curl -s -H "Authorization: $TOKEN" $API/device/device-1/status
curl -s -H "Authorization: $TOKEN" $API/device/device-1/settings
curl -s -X POST -H "Authorization: $TOKEN" $API/device/device-1/plug-in      # the whole chain fires
curl -s -H "Authorization: $TOKEN" $API/device/device-1/schedule
curl -s -H "Authorization: $TOKEN" $API/device/device-1/savings
curl -s -X PUT -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"reserve_soc":30,"target_soc":90,"departure_time":"06:45"}' $API/device/device-1/settings   # triggers a re-plan
curl -s -H "Authorization: $TOKEN" $API/device/device-9/status               # 404: not a known device

# 4. Clean up the throwaway user
aws cognito-idp admin-delete-user --user-pool-id $POOL --username tester@theo.demo
```
The demo user for the browser: `terraform output demo_username`, and the one-time password with
`terraform output -raw demo_temporary_password`.

## Testing Phase 6 (the web app)

```bash
make -C capstone apply                    # bucket, CloudFront (a few minutes), config.json
# Actions → T.H.E.O. App Deploy → Run workflow   (builds and uploads the app; the run's Summary shows the address)
cd capstone/infra/theo
APP=$(terraform output -raw app_url); echo $APP

curl -s -o /dev/null -w "%{http_code}\n" $APP/                  # 200: the app
curl -s -o /dev/null -w "%{http_code}\n" $APP/dashboard         # 200: no such file, but CloudFront answers with index.html
curl -s $APP/config.json                                        # the API address and login IDs
curl -s -o /dev/null -w "%{http_code}\n" https://$(terraform output -raw frontend_bucket).s3.amazonaws.com/index.html   # 403: the bucket is private

# the API accepts the app's address and refuses others (CORS)
curl -s -i -X OPTIONS -H "Origin: $APP" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: authorization" $(terraform output -raw api_url)/device/device-1/status | grep -i access-control-allow-origin
```
Then open `$APP` in a browser: sign in with `terraform output demo_username` and
`terraform output -raw demo_temporary_password`, choose a new password, press PLUG IN, and watch the
Dashboard fill in.

## Testing Phase 7 (Grafana, alarms, security)

```bash
make -C capstone apply
cd capstone/infra/theo
terraform output -raw grafana_url                       # http://<ip>:3000
aws secretsmanager get-secret-value --secret-id theo/grafana-admin-password --query SecretString --output text
```
- **Email:** click the confirmation link AWS sends to `alert_email`.
- **Grafana:** open the URL, log in as `admin`, open the dashboard **T.H.E.O. platform**. The "Targets up" panel
  should show all four jobs UP. Give the box about 3 minutes after `apply` to install everything.
- **Targets from the box itself** (Prometheus is not open to the internet): run on the box through SSM
  `curl -s localhost:9090/api/v1/targets` and check every target is `up`.
- **An alarm:** stop the optimizer (`aws ecs update-service --cluster theo-cluster --service theo-optimizer-service --desired-count 0`),
  wait about 8 minutes (Container Insights publishes its metric with a delay) for `theo-optimizer-not-running` to go to ALARM and send an email, then set `--desired-count 1`.
- **Inspector:** `aws inspector2 list-findings --max-results 5`. Findings appear after the first scans (can take a while).
- **CloudTrail:** `aws cloudtrail get-trail-status --name theo-trail --query IsLogging`.

## Troubleshooting

| Error | Meaning |
|---|---|
| `AWS Account ID not allowed` | credentials belong to a different account than `var.aws_account_id` |
| `Backend initialization required` | run `make -C capstone init` |
| API answers `401` with a token | wrong token type or an expired one (they last 1 hour); log in again |
| API answers `500` right after `apply` | the Lambda permission for API Gateway has not propagated yet; retry in a minute |
| `NoSuchBucket` on init | step 2 not done, or the lab was wiped; repeat steps 1 and 2 |
