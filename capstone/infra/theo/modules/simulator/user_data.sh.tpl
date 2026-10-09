#!/bin/bash
# user_data for the simulator box. Runs once, as root, on first boot.
# Terraform fills in the dollar-brace placeholders; every other $ is ordinary shell.
# code hash: ${code_hash}
set -euxo pipefail
exec > >(tee /var/log/theo-bootstrap.log) 2>&1   # everything below is logged here

# ---- 1. Python 3.11 (the spec's version; AL2023's default is older) ----------
dnf install -y python3.11 python3.11-pip

# ---- 2. node_exporter: machine metrics (CPU, memory, disk) on :9100 ----------
# Prometheus on the observability box scrapes this in Phase 7.
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

# ---- 3. The simulator: code from S3, certificates from SSM -------------------
useradd --system --home-dir /opt/theo --shell /sbin/nologin theo || true
mkdir -p /opt/theo/sim /opt/theo/certs

aws s3 cp "s3://${bucket}/simulator/" /opt/theo/sim/ --recursive --region ${region}
python3.11 -m pip install -r /opt/theo/sim/requirements.txt

# Amazon's root CA: how devices verify they are really talking to AWS IoT.
curl -fsSL https://www.amazontrust.com/repository/AmazonRootCA1.pem -o /opt/theo/certs/AmazonRootCA1.pem

for id in ${device_ids}; do
  aws ssm get-parameter --region ${region} --name "/${project}/devices/$id/cert" \
    --query Parameter.Value --output text > "/opt/theo/certs/$id.cert.pem"
  aws ssm get-parameter --region ${region} --name "/${project}/devices/$id/key" --with-decryption \
    --query Parameter.Value --output text > "/opt/theo/certs/$id.key.pem"
done

# Private keys readable by the service user only (mode 600).
chown -R theo:theo /opt/theo
chmod 700 /opt/theo/certs
chmod 600 /opt/theo/certs/*

cat > /etc/systemd/system/theo-simulator.service <<'UNIT'
[Unit]
Description=THEO virtual devices
After=network-online.target
Wants=network-online.target

[Service]
User=theo
WorkingDirectory=/opt/theo/sim
EnvironmentFile=/etc/theo-simulator.env
ExecStart=/usr/bin/python3.11 /opt/theo/sim/device.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/theo-simulator.env <<ENV
IOT_ENDPOINT=${iot_endpoint}
DEVICE_IDS=${device_ids_csv}
TIME_SCALE=${time_scale}
CERT_DIR=/opt/theo/certs
ENV

systemctl daemon-reload
systemctl enable --now node_exporter theo-simulator
