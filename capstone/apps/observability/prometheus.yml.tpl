# Prometheus asks each target for its numbers every 15 seconds.
# Terraform fills in the simulator's address (${simulator_ip}).
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: simulator_node
    static_configs:
      - targets: ["${simulator_ip}:9100"]
        labels:
          box: simulator

  - job_name: simulator_app
    static_configs:
      - targets: ["${simulator_ip}:8000"]
        labels:
          box: simulator

  - job_name: observability_node
    static_configs:
      - targets: ["localhost:9100"]
        labels:
          box: observability

  # The optimizer is a Fargate task whose address changes on every deploy, so a
  # small script (find-optimizer.sh) writes its current address into this file.
  - job_name: optimizer
    file_sd_configs:
      - files: ["/etc/prometheus/targets/optimizer.json"]
