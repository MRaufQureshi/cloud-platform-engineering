#!/bin/bash
# user_data for the observability box. Runs once, as root, on first boot.
# config hash: ${config_hash}
set -euxo pipefail
exec > >(tee /var/log/theo-bootstrap.log) 2>&1

# ---- node_exporter: machine metrics on :9100 (Prometheus scrapes it on this box too)
useradd --system --no-create-home --shell /sbin/nologin node_exporter || true
curl -fsSL "https://github.com/prometheus/node_exporter/releases/download/v${node_exporter_version}/node_exporter-${node_exporter_version}.linux-amd64.tar.gz" \
  | tar -xz -C /tmp
install -m 0755 /tmp/node_exporter-${node_exporter_version}.linux-amd64/node_exporter /usr/local/bin/node_exporter

cat > /etc/systemd/system/node_exporter.service <<'UNIT'
[Unit]
Description=Prometheus node_exporter
After=network.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

# ---- Docker and Docker Compose
dnf install -y docker
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v${compose_version}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# ---- the config files from S3, and the Grafana password from Secrets Manager
mkdir -p /opt/theo/observability/targets
aws s3 cp "s3://${bucket}/observability/" /opt/theo/observability/ --recursive --region ${region}
echo '[]' > /opt/theo/observability/targets/optimizer.json
chmod +x /opt/theo/observability/find-optimizer.sh

PASSWORD=$(aws secretsmanager get-secret-value --secret-id "${secret_id}" --region ${region} --query SecretString --output text)
echo "GRAFANA_PASSWORD=$PASSWORD" > /opt/theo/observability/.env
chmod 600 /opt/theo/observability/.env

# ---- the small script that finds the optimizer task, run as a service
cat > /etc/systemd/system/find-optimizer.service <<'UNIT'
[Unit]
Description=Tell Prometheus where the optimizer task is
After=network-online.target

[Service]
Environment=CLUSTER=${cluster}
Environment=SERVICE=${service}
Environment=REGION=${region}
ExecStart=/opt/theo/observability/find-optimizer.sh
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now node_exporter find-optimizer

# ---- start Prometheus and Grafana
cd /opt/theo/observability
docker compose up -d
