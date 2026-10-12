# Prometheus asks each target for its numbers every 15 seconds.
# Terraform fills in the simulator's address (${simulator_ip}) and the two website addresses.
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

  # Website monitoring (Grafana dashboard 13041). Prometheus asks the blackbox exporter
  # (localhost:9115) to open each address; the job names are what the dashboard expects.
  - job_name: website-monitoring-http
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - ${landing_url}
          - ${app_url}
          - http://${simulator_ip}:8000/metrics
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: localhost:9115

  - job_name: website-monitoring-icmp
    metrics_path: /probe
    params:
      module: [icmp]
    static_configs:
      - targets: ["${simulator_ip}"]
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: localhost:9115
