# observability

Prometheus collects numbers from the platform and Grafana draws them. Both run in Docker on a
second EC2 box, built by `infra/theo/modules/observability`.

## What you'll learn
- The difference between the customer's view (the web app) and the operator's view (Grafana)
- How Prometheus pulls numbers from `/metrics` endpoints every 15 seconds
- How a CloudWatch alarm turns a metric into an email through SNS

## Files
| File | Role |
|---|---|
| `docker-compose.yml` | starts Prometheus, Grafana and the blackbox exporter |
| `blackbox.yml` | the two probes the blackbox exporter can do: open a web address (`http_2xx`) and ping (`icmp`) |
| `prometheus.yml.tpl` | what Prometheus scrapes; Terraform fills in the simulator's address |
| `find-optimizer.sh` | the optimizer is a Fargate task whose address changes on every deploy, so this asks ECS where it is every 30 seconds and writes it where Prometheus looks |
| `grafana/datasources.yml` | Prometheus and CloudWatch as data sources (CloudWatch uses the box's IAM role) |
| `grafana/dashboards.yml`, `grafana/theo-dashboard.json` | the ready-made dashboard |
| `grafana/website.json` | [Grafana dashboard 13041](https://grafana.com/grafana/dashboards/13041-website-monitoring/) (website monitoring), with its job names and data source fixed |

## What Prometheus scrapes
| Job | Address | What it shows |
|---|---|---|
| `simulator_node`, `observability_node` | `:9100` (node_exporter) | CPU and memory of the two boxes |
| `simulator_app` | simulator `:8000` | messages sent, battery per device |
| `website-monitoring-http` | landing site, web app, simulator `:8000/metrics`, via the blackbox exporter (`:9115`) | up/down, response time, TLS certificate expiry |
| `website-monitoring-icmp` | the simulator's address (ping) | ping time |
| `optimizer` | the task's address, found by `find-optimizer.sh` | jobs solved, solve time |

## The four alarms (they email `alert_email`)
| Alarm | Fires when |
|---|---|
| `theo-replan-queue-old-message` | a re-plan request waits more than 5 minutes |
| `theo-dlq-not-empty` | a message landed in the dead-letter queue |
| `theo-optimizer-not-running` | the optimizer has no running task |
| `theo-no-telemetry` | no telemetry for 15 minutes |

## Open Grafana
`terraform output -raw grafana_url` (the address of the load balancer in front of Grafana, port 80, reachable only from your IP;
the box itself is not open to the internet). Log in as `admin`; the password is in
Secrets Manager under `theo/grafana-admin-password`. The dashboard **T.H.E.O. platform** is in the THEO folder.
