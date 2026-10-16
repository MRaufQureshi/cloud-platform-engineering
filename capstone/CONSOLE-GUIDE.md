# T.H.E.O. by hand: every service and how to set it up in the AWS console

Terraform builds all of this for you. This guide shows the same thing service by service, with only the settings needed to make each one work. Use it to understand what each piece is, or to build a single piece by hand.

> Region **us-east-1** everywhere. Names use the prefix `theo-`. Settings come from reading the Terraform in `infra/theo/modules/`; I have not clicked through them in the console, so a menu label may differ slightly.
> Use your own values for passwords and IDs. Never type a real password into a document.

**Build order** (each step needs the ones above it): 1 Network → 2 Security groups → 3 Endpoints → 4 IAM roles → 5 DynamoDB, S3, SQS → 6 IoT Core → 7 EC2 simulator → 8 ECR, ECS → 9 EventBridge, Lambdas → 10 Cognito, API Gateway → 11 CloudFront → 12 Observability → 13 Security services.

---

## 1. VPC, subnets, gateways and route tables

- **What it does:** a private network in AWS, split into public and private subnets, with the gateways and route tables that decide what can reach the internet.
- **Why we use it:** it keeps the optimizer private (no public IP) while the simulator and Grafana are reachable.
- **Connects to:** every EC2, the ECS task, the ALB and the VPC endpoints live inside it.
- **Console steps:**
  - VPC console > Your VPCs > Create VPC > **VPC only**
    - Name: `theo-vpc`, IPv4 CIDR: `10.0.0.0/16`
    - After creating: Actions > Edit VPC settings > tick **Enable DNS hostnames**
  - Subnets > Create subnet (VPC `theo-vpc`), add four:
    - `theo-public-a`: `us-east-1a`, `10.0.1.0/24`
    - `theo-public-b`: `us-east-1b`, `10.0.2.0/24`
    - `theo-private-a`: `us-east-1a`, `10.0.11.0/24`
    - `theo-private-b`: `us-east-1b`, `10.0.12.0/24`
    - For both public subnets: Actions > Edit subnet settings > **Enable auto-assign public IPv4 address**
  - Internet gateways > Create `theo-igw` > Actions > Attach to VPC > `theo-vpc`
  - Elastic IPs > Allocate Elastic IP address (name `theo-nat-eip`)
  - NAT gateways > Create: name `theo-nat`, subnet **`theo-public-a`**, connectivity **Public**, Elastic IP: the one you just made
  - Route tables > Create `theo-public-rt` (VPC `theo-vpc`) > Routes > Edit: add `0.0.0.0/0` → Internet Gateway `theo-igw` > Subnet associations: both public subnets
  - Route tables > Create `theo-private-rt` > Routes > Edit: add `0.0.0.0/0` → NAT Gateway `theo-nat` > Subnet associations: both private subnets

## 2. Security groups

- **What it does:** a firewall per kind of server; each rule names the source that may connect.
- **Why we use it:** only the load balancer reaches Grafana, only Grafana's box scrapes the metrics ports, and the endpoints accept traffic from inside the VPC only.
- **Connects to:** EC2, ECS task, ALB and the VPC endpoints.
- **Console steps:** VPC console > Security groups > Create security group (VPC `theo-vpc`). Leave outbound as the default (all traffic). Create `alb-sg` and `obs-sg` first, then the others, so you can pick them as sources.
  - `theo-alb-sg`: inbound HTTP `80` from **My IP** (it adds a /32)
  - `theo-obs-sg`: inbound Custom TCP `3000` from `theo-alb-sg`; Custom TCP `9100` from `theo-obs-sg` (itself; add after saving)
  - `theo-sim-sg`: inbound Custom TCP `9100` and `8000` from `theo-obs-sg`; **All ICMP - IPv4** from `theo-obs-sg`
  - `theo-fargate-sg`: inbound Custom TCP `8000` from `theo-obs-sg`
  - `theo-vpce-sg`: inbound HTTPS `443` from `10.0.0.0/16`
  - On `theo-alb-sg`, edit **outbound**: remove the default rule and add Custom TCP `3000` to `theo-obs-sg`

## 3. VPC endpoints

- **What it does:** private doors from the VPC to AWS services, so traffic does not go over the internet.
- **Why we use it:** the private optimizer pulls its image, writes logs, reads the queue and reads DynamoDB with no public IP.
- **Connects to:** ECR, CloudWatch Logs, SQS, Secrets Manager, S3, DynamoDB.
- **Console steps:** VPC console > Endpoints > Create endpoint (VPC `theo-vpc`).
  - **Gateway endpoints** (free), one each for `com.amazonaws.us-east-1.s3` and `...dynamodb`: tick **both** route tables (`theo-public-rt`, `theo-private-rt`)
  - **Interface endpoints**, one each for `ecr.api`, `ecr.dkr`, `logs`, `sqs`, `secretsmanager`:
    - Subnets: both private subnets
    - Security group: `theo-vpce-sg` (remove default)
    - **Enable DNS name** (private DNS): ticked
  - (`secretsmanager` is not used by anything in the private subnets; you can skip it.)

## 4. IAM roles

- **What it does:** gives each service only the permissions it needs.
- **Why we use it:** least privilege, so a bug in one service cannot touch the rest.
- **Connects to:** every service below uses one.
- **Console steps:** IAM > Roles > Create role. Attach the permissions as you reach each service; the full list is in `infra/theo/modules/*/iam.tf`.
  - `theo-simulator` (trusted entity: EC2): AWS managed `AmazonSSMManagedInstanceCore`, plus read access to the data bucket prefixes `simulator/*` and `ansible/*` and to the SSM parameters `/theo/devices/*`
  - `theo-observability` (EC2): `AmazonSSMManagedInstanceCore`, `CloudWatchReadOnlyAccess`, read `observability/*` and `ansible/*`, read the Grafana secret, `ecs:ListTasks` and `ecs:DescribeTasks`
  - `theo-optimizer-execution` (trusted entity: Elastic Container Service Task): `AmazonECSTaskExecutionRolePolicy`
  - `theo-optimizer-task` (ECS task): DynamoDB read/write on five tables, SQS receive/delete on the queue, `iot:Publish` to `theo/*/schedule`
  - `theo-iot-rules` (trusted entity: IoT): `dynamodb:PutItem` on two tables, `sqs:SendMessage` on the queue, write to the rule-error log group
  - Lambda roles `theo-api`, `theo-price-fetcher`, `theo-forecast` (trusted entity: Lambda): `AWSLambdaBasicExecutionRole` plus the table, queue and IoT actions listed in section 9 and 10

## 5. DynamoDB

- **What it does:** a managed key-value database with no servers.
- **Why we use it:** it stores device state, settings, schedules, prices, savings and telemetry (Telemetry is Measurements a device sends about itself, automatically and regularly ("tele" = distant, "metry" = measuring)).
- **Connects to:** IoT rules (write), optimizer, API Lambda and price Lambda (read/write).
- **Console steps:** DynamoDB console > Tables > Create table. Do this six times. Table settings for all: **Customize settings**, capacity mode **On-demand**.

  | Table name | Partition key (String) | Sort key (String) |
  |---|---|---|
  | `theo-device-state` | `device_id` | none |
  | `theo-settings` | `device_id` | none |
  | `theo-schedules` | `device_id` | `slot_start` |
  | `theo-prices` | `date` | `hour` |
  | `theo-savings` | `device_id` | `date` |
  | `theo-telemetry` | `device_id` | `timestamp` |

  - After creating each: open it > Backups > **Point-in-time recovery: Edit > On**
  - `theo-telemetry` only: Additional settings > **Time to live (TTL) > Enable**, attribute name `ttl`

## 6. S3 buckets

- **What it does:** object storage.
- **Why we use it:** four private buckets: `theo-data-<account id>` (simulator code, Ansible files, raw prices), `theo-audit-<account id>` (CloudTrail logs), plus one for the web app and one for the landing site (both read only by CloudFront).
- **Connects to:** EC2 boxes (read at boot), price Lambda (write), CloudTrail (write), CloudFront (read).
- **Console steps:** S3 console > Create bucket (region us-east-1), once per bucket:
  - Bucket name: globally unique (include your account ID)
  - Block all public access: **on** (default)
  - Default encryption: **SSE-S3**
  - Audit bucket only: **Bucket Versioning: Enable**
  - The web app and landing buckets get a bucket policy in section 11.

## 7. SQS queues

- **What it does:** a message queue with a dead-letter queue for failures (A managed waiting line for messages between two programs). Dead-letter queue (DLQ) - A second queue that catches messages the main queue could not get processed.
- **Why we use it:** it is the "please re-plan" inbox; the optimizer wakes up when a message arrives.
- **Connects to:** IoT rule B, the API Lambda and the price Lambda (send); the optimizer (receive).
- **Console steps:** SQS console > Create queue, **Standard**.
  - First `theo-replan-dlq`: Message retention period **14 days**
  - Then `theo-replan-queue`: Visibility timeout **60 seconds**, Message retention **1 day**, Dead-letter queue: **Enabled**, choose `theo-replan-dlq`, Maximum receives **3**

## 8. AWS IoT Core

- **What it does:** a managed MQTT (Message Queuing Telemetry Transport) broker that gives each device an identity (certificate) and routes its messages.
- **Why we use it:** A lightweight messaging protocol made for small devices and weak networks. Devices don't call each other. They connect to a broker (here AWS IoT Core) and publish messages to a topic the three virtual homes publish telemetry and events here, and receive schedules and commands.
- **Connects to:** the simulator (MQTT), DynamoDB and SQS (through rules), the optimizer and the API Lambda (publish).
- **Console steps:** IoT Core console.
  - Manage > All devices > Things > Create things > **Create single thing**: name `device-1` (repeat for `device-2`, `device-3`), no shadow, **Auto-generate a new certificate**, then **download** the certificate and private key (you cannot download the key again). Activate the certificate.
  - Security > Policies > Create policy `theo-device-1-policy`, JSON: allow `iot:Connect` on `client/device-1`; `iot:Publish` on `topic/theo/device-1/telemetry` and `.../event`; `iot:Subscribe` on `topicfilter/theo/device-1/control` and `.../schedule`; `iot:Receive` on `topic/theo/device-1/control` and `.../schedule`. Attach it to the certificate. Repeat per device.
  - Message routing > Rules > Create rule (add an **Error action**: CloudWatch Logs, log group `/theo/iot-rule-errors`, role `theo-iot-rules`):
    - `theo_telemetry_to_dynamodb`: SQL `SELECT device_id, ts AS timestamp, soc, plugged_in, meter_kw, solar_kw, ev_power_kw, floor(timestamp() / 1000) + 86400 AS ttl FROM 'theo/+/telemetry'`; action **DynamoDBv2** → `theo-telemetry`
    - `theo_telemetry_to_device_state`: SQL `SELECT device_id, soc, plugged_in, ev_power_kw AS power_kw, ts AS updated_at, timestamp() AS received_ms FROM 'theo/+/telemetry'`; action DynamoDBv2 → `theo-device-state`
    - `theo_event_to_replan_queue`: SQL `SELECT device_id, event AS reason, plugged_in, soc, ts FROM 'theo/+/event'`; action **SQS** → `theo-replan-queue`
  - Settings: copy the **Device data endpoint** (you need it for the simulator and optimizer).

## 9. EC2: the simulator

- **What it does:** one small server that pretends to be three smart homes.
- **Why we use it:** the demo has no real hardware, so this box produces the telemetry.
- **Connects to:** IoT Core (MQTT, port 8883), S3 (its code), SSM Parameter Store (its certificates), Prometheus (metrics).
- **Console steps:**
  - Systems Manager > Parameter Store > Create parameter, per device: `/theo/devices/device-1/cert` (type String, the certificate PEM) and `/theo/devices/device-1/key` (type **SecureString**, the private key)
  - S3: upload `apps/simulator/device.py` and `requirements.txt` to `theo-data-<account>/simulator/`
  - EC2 > Launch instance: name `theo-simulator`, **Amazon Linux 2023**, `t3.small`
    - **No key pair** (access is by Session Manager)
    - Network: `theo-vpc`, subnet `theo-public-a`, auto-assign public IP **Enable**, security group `theo-sim-sg`
    - Advanced details: IAM instance profile `theo-simulator`, Metadata version **V2 only (token required)**
    - User data: the starter in `infra/theo/modules/simulator/user_data.sh.tpl` (installs Ansible, runs `ansible/simulator.yml`), with its `${...}` values filled in
  - Check: Session Manager > connect, then `journalctl -u theo-simulator -f`

## 10. ECR and ECS Fargate: the optimizer

- **What it does:** ECR stores the container image; ECS Fargate runs it with no server to manage.
- **Why we use it:** the optimizer (a linear-program solver) runs as a container in the private subnets.
- **Connects to:** SQS (reads), DynamoDB (reads and writes), IoT Core (publishes schedules), Prometheus (scraped on :8000).
- **Console steps:**
  - ECR > Create repository: `theo-optimizer`, tag immutability **Immutable**
  - Build and push the image (ECR > the repository > **View push commands**), from `apps/optimizer`
  - ECS > Clusters > Create cluster: `theo-cluster`, infrastructure **AWS Fargate**, Monitoring > **Use Container Insights**
  - ECS > Task definitions > Create: family `theo-optimizer`, launch type **Fargate**, **Linux/X86_64**, CPU **0.5 vCPU**, memory **1 GB**, task role `theo-optimizer-task`, execution role `theo-optimizer-execution`
    - Container: name `optimizer`, image URI from ECR, port `8000`
    - Environment variables: `AWS_REGION`, `REPLAN_QUEUE_URL`, `IOT_ENDPOINT` (the data endpoint without `https://`), `TABLE_DEVICE_STATE`, `TABLE_SETTINGS`, `TABLE_SCHEDULES`, `TABLE_PRICES`, `TABLE_SAVINGS` (the table names)
    - Log collection: awslogs, group `/ecs/theo-optimizer`
  - Cluster > Services > Create: task definition `theo-optimizer`, desired tasks **1**, networking: `theo-vpc`, **both private subnets**, security group `theo-fargate-sg`, **Public IP: turned off**

## 11. EventBridge and the Lambda functions

- **What it does:** EventBridge runs things on a schedule; Lambda runs a function with no server.
- **Why we use it:** `theo-price-fetcher` downloads tomorrow's prices every day; `theo-forecast` is a stub; `theo-api` answers the web app (section 12).
- **Connects to:** price fetcher: aWATTar website, DynamoDB, S3, SQS. EventBridge: the price Lambda.
- **Console steps:**
  - Lambda > Create function: `theo-price-fetcher`, runtime **Python 3.11**, role `theo-price-fetcher`; upload `apps/lambdas/price_fetcher` zipped; Configuration: timeout **30 s**, memory **128 MB**, environment `TABLE_PRICES`, `DATA_BUCKET`, `REPLAN_QUEUE_URL`, `DEVICE_IDS` (`device-1,device-2,device-3`)
  - Lambda > Create function: `theo-forecast` (Python 3.11, timeout 5 s), upload `apps/lambdas/forecast`
  - EventBridge > Rules > Create rule: `theo-daily-prices`, **Schedule**, cron `5 13 * * ? *` (13:05 UTC), target **Lambda function** `theo-price-fetcher`
  - Test: Lambda > Test, then check rows in `theo-prices`

## 12. Cognito and API Gateway

- **What it does:** Cognito handles sign-in and issues tokens (JWTs); API Gateway is the public door that checks the token and forwards the call to a Lambda.
- **Why we use it:** only a logged-in user may plug the car in, change settings and read savings.
- **Connects to:** the browser (login), the `theo-api` Lambda, then DynamoDB, SQS and IoT Core.
- **Console steps:**
  - Lambda > Create function `theo-api` (Python 3.11, timeout **10 s**, memory **256 MB**, role `theo-api`), upload `apps/lambdas/api_handler`; environment: `DEVICE_IDS`, `IOT_ENDPOINT`, `REPLAN_QUEUE_URL`, `TABLE_STATE`, `TABLE_SETTINGS`, `TABLE_SCHEDULES`, `TABLE_SAVINGS`
  - Cognito > Create user pool: sign-in option **Email**; MFA **No MFA**; self-registration **off**; password policy: 10+ characters with upper, lower, number and symbol; name `theo-users`
    - App client `theo-web`: type Single-page app, **no client secret**, auth flows **ALLOW_USER_SRP_AUTH**, **ALLOW_USER_PASSWORD_AUTH**, **ALLOW_REFRESH_TOKEN_AUTH**
    - Users > Create user: `admin@theo.demo`, email verified, a temporary password of your choice (the user must change it at first sign-in)
  - API Gateway > Create API > **HTTP API**: name `theo-api`
    - Integrations: Lambda `theo-api`, payload format **2.0**
    - Routes (seven): `GET /device/{id}/status`, `GET /device/{id}/savings`, `GET /device/{id}/schedule`, `GET /device/{id}/settings`, `PUT /device/{id}/settings`, `POST /device/{id}/plug-in`, `POST /device/{id}/plug-out`, each attached to the integration
    - Authorization > Create **JWT authorizer**: identity source `$request.header.Authorization`, issuer `https://cognito-idp.us-east-1.amazonaws.com/<user pool ID>`, audience the app client ID; attach it to all seven routes
    - CORS: allow origin your CloudFront web app URL (and `http://localhost:5173` for local work), methods GET, POST, PUT, OPTIONS, headers `authorization`, `content-type`
    - Stage `$default`, auto-deploy on; Throttling: rate 10, burst 20
  - Test with a token from Cognito and `curl` (see `infra/theo/README.md`, "Testing Phase 5")

## 13. CloudFront: the web app and the landing site

- **What it does:** a global cache and HTTPS front for static files kept in a private S3 bucket.
- **Why we use it:** the React app and the landing site are served over HTTPS without making the buckets public.
- **Connects to:** the two private S3 buckets (through Origin Access Control).
- **Console steps:** do this twice (web app, landing site). CloudFront > Create distribution:
  - Origin domain: the S3 bucket; Origin access: **Origin access control settings** > Create new OAC (sign requests, S3)
  - Viewer protocol policy: **Redirect HTTP to HTTPS**; Allowed methods **GET, HEAD**; cache policy **CachingOptimized**
  - Default root object: `index.html`; Price class: **North America and Europe only**
  - After creating, copy the **bucket policy** CloudFront offers and paste it into the bucket's Permissions > Bucket policy
  - Web app only: Error pages > Create custom error response for **403** and **404**: response page `/index.html`, HTTP response code **200**
  - Upload the built app (`apps/frontend`, `npm run build`, copy `dist/`) plus a `config.json` holding the API URL and the Cognito IDs; invalidate `/*` after each upload

## 14. EC2: the observability box, plus the load balancer

- **What it does:** a server running Prometheus (collects numbers), Grafana (draws them) and a blackbox exporter (probes websites); an Application Load Balancer sits in front of Grafana.
- **Why we use it:** the operator's view of the platform, separate from the customer's web app.
- **Connects to:** the simulator and optimizer (scrapes them), CloudFront (probes it), CloudWatch (a Grafana data source), Secrets Manager (the Grafana password).
- **Console steps:**
  - Secrets Manager > Store a new secret > **Other type of secret** > plaintext: a password you choose; name `theo/grafana-admin-password`
  - S3: upload `apps/observability/*` to `theo-data-<account>/observability/` and `ansible/` to `.../ansible/`
  - EC2 > Launch instance `theo-observability`: Amazon Linux 2023, `t3.small`, no key pair, subnet `theo-public-b`, public IP enabled, security group `theo-obs-sg`, IAM profile `theo-observability`, IMDSv2 required, user data = starter from `modules/observability/user_data.sh.tpl`
  - EC2 > Target groups > Create: type **Instances**, protocol HTTP, port `3000`, VPC `theo-vpc`, health check path `/api/health`, success code `200`; register the instance on port 3000
  - EC2 > Load balancers > Create **Application Load Balancer**: name `theo-grafana`, **Internet-facing**, both public subnets, security group `theo-alb-sg`, listener HTTP `80` → forward to the target group
  - Open the load balancer's DNS name; log in as `admin` with the secret

## 15. CloudWatch alarms and SNS

- **What it does:** alarms watch a metric and notify an SNS topic, which emails you.
- **Why we use it:** you hear about a stuck queue or a stopped optimizer without watching Grafana.
- **Connects to:** SQS, ECS Container Insights and IoT metrics (watched); your email inbox (notified).
- **Console steps:**
  - SNS > Topics > Create topic: **Standard**, `theo-alerts` > Create subscription: protocol **Email**, your address; **confirm** the email AWS sends
  - CloudWatch > Alarms > Create alarm (action: **Send a notification to** `theo-alerts`), four times:
    - `theo-replan-queue-old-message`: SQS > Queue Metrics, `ApproximateAgeOfOldestMessage` for `theo-replan-queue`, Maximum, 1 minute, **> 300**
    - `theo-dlq-not-empty`: SQS, `ApproximateNumberOfMessagesVisible` for `theo-replan-dlq`, 1 minute, **> 0**
    - `theo-optimizer-not-running`: ECS/ContainerInsights, `RunningTaskCount` for ClusterName `theo-cluster` and the service, 1 minute, **< 1**, 2 datapoints, missing data **breaching**
    - `theo-no-telemetry`: AWS/IoT, `TopicMatch` for the telemetry rule, 5 minutes, **< 1**, 3 of 3 datapoints, missing data **breaching**

## 16. CloudTrail

- **What it does:** records every management action in the account (who did what, when).
- **Why we use it:** an audit trail, kept in a private versioned bucket.
- **Connects to:** the `theo-audit-<account>` S3 bucket.
- **Console steps:** CloudTrail > Trails > Create trail: name `theo-trail`, **Use existing S3 bucket**: `theo-audit-<account>`, log file SSE-KMS off, events: **Management events** (read and write). (The bucket needs the CloudTrail bucket policy; the console offers to add it.)

## 17. Inspector and ECR scanning

- **What it does:** scans EC2 instances, container images and Lambda functions for known vulnerabilities.
- **Why we use it:** a basic security check with no setup per resource.
- **Connects to:** EC2, ECR and Lambda.
- **Console steps:** Inspector > Get started / Settings > **Activate Inspector** for EC2, ECR and Lambda. ECR > Private registry > Scanning configuration > **Enhanced scanning**, scan all repositories (continuous).

## 18. Secrets Manager and Systems Manager (SSM)

- **What it does:** Secrets Manager stores the Grafana password; Systems Manager gives shell access (Session Manager) and stores the device certificates (Parameter Store).
- **Why we use it:** no passwords in code, and no SSH keys or open port 22.
- **Connects to:** the two EC2 boxes (both read from them).
- **Console steps:** the secret and the parameters are created in sections 14 and 9. To open a shell: EC2 > select the instance > **Connect** > **Session Manager** > Connect (needs the `AmazonSSMManagedInstanceCore` policy on the instance role).

## 19. GitHub OIDC (for the pipeline)

- **What it does:** lets GitHub Actions get short-lived AWS credentials without stored keys.
- **Why we use it:** the three workflows plan, apply and deploy safely.
- **Connects to:** the GitHub repository and the two IAM roles `github-actions-theo-terraform-plan` (read-only) and `github-actions-theo-terraform-apply` (main branch only).
- **Console steps:** IAM > Identity providers > Add provider > **OpenID Connect**: URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. Then IAM > Roles > Create role > **Web identity** > that provider > audience `sts.amazonaws.com`, restrict the trust policy `sub` to your repository (and, for the apply role, to `refs/heads/main`). The exact policies are in `infra/prerequisites/`; the simplest route is `make -C capstone prerequisites`.
