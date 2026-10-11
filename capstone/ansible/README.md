# ansible

What runs on the two EC2 boxes after they boot. Each box's `user_data` is only a starter: it installs
`ansible-core`, downloads this folder from S3 and runs one playbook on itself (`-c local`).

| File | Role |
|---|---|
| `simulator.yml` | the simulator box: node_exporter, Python 3.11, the device code, the certificates, the service |
| `observability.yml` | the observability box: node_exporter, Docker + Compose, Prometheus + Grafana, the optimizer finder |
| `roles/node_exporter` | machine metrics on :9100, used by both boxes |
| `roles/simulator`, `roles/observability` | the steps for each box |

Terraform uploads this folder to the data bucket (`ansible/`) and passes the values it knows (endpoints,
device IDs, versions) as one JSON block. A change in any file here replaces both boxes on the next apply.
The boot log is on the box in `/var/log/theo-bootstrap.log` (Session Manager gives you a shell).
