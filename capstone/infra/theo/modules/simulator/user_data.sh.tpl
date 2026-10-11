#!/bin/bash
# Starter: installs Ansible, downloads the playbooks from S3, runs one on this box.
# hashes: ${hashes}
set -euxo pipefail
exec > >(tee /var/log/theo-bootstrap.log) 2>&1

dnf install -y ansible-core
mkdir -p /opt/theo
aws s3 sync "s3://${bucket}/ansible" /opt/theo/ansible --region ${region}

cat > /opt/theo/vars.json <<'VARS'
${vars_json}
VARS

ansible-playbook -c local -i localhost, -e @/opt/theo/vars.json /opt/theo/ansible/simulator.yml
