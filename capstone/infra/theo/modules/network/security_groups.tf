# modules/network/security_groups.tf
#
# Four security groups = four small firewalls, one per kind of thing in the VPC.
# They refer to EACH OTHER instead of IP ranges ("allow from obs-sg"), so the
# rules keep working when instances get new addresses.
#
#   sim-sg      simulator EC2     :9100 node_exporter, :8000 app metrics  <- obs-sg only
#   obs-sg      Grafana/Prometheus :3000 Grafana                          <- your IP only
#   fargate-sg  optimizer task    :8000 app metrics                       <- obs-sg only
#   vpce-sg     interface endpoints :443                                  <- inside the VPC
#
# All egress is open: these hosts must call AWS APIs, aWATTar and the IoT endpoint.

resource "aws_security_group" "sim" {
  name        = "${var.project_name}-sim-sg"
  description = "Simulator EC2: metrics from the observability box only"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "obs" {
  name        = "${var.project_name}-obs-sg"
  description = "Observability EC2: Grafana from my IP only"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "fargate" {
  name        = "${var.project_name}-fargate-sg"
  description = "Optimizer task: metrics from the observability box only"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "vpce" {
  name        = "${var.project_name}-vpce-sg"
  description = "Interface VPC endpoints: HTTPS from inside the VPC"
  vpc_id      = aws_vpc.main.id
}

# --- sim-sg inbound
resource "aws_vpc_security_group_ingress_rule" "sim_node_exporter" {
  security_group_id            = aws_security_group.sim.id
  referenced_security_group_id = aws_security_group.obs.id
  ip_protocol                  = "tcp"
  from_port                    = 9100
  to_port                      = 9100
  description                  = "node_exporter from obs-sg"
}

resource "aws_vpc_security_group_ingress_rule" "sim_app_metrics" {
  security_group_id            = aws_security_group.sim.id
  referenced_security_group_id = aws_security_group.obs.id
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  description                  = "simulator /metrics from obs-sg"
}

# --- obs-sg inbound
resource "aws_vpc_security_group_ingress_rule" "obs_grafana" {
  security_group_id = aws_security_group.obs.id
  cidr_ipv4         = "${var.my_ip}/32" # /32 = exactly one address
  ip_protocol       = "tcp"
  from_port         = 3000
  to_port           = 3000
  description       = "Grafana from my IP only"
}

# Prometheus scrapes node_exporter on its own box too (it is a scrape target),
# so obs-sg must let itself in on :9100.
resource "aws_vpc_security_group_ingress_rule" "obs_node_exporter_self" {
  security_group_id            = aws_security_group.obs.id
  referenced_security_group_id = aws_security_group.obs.id
  ip_protocol                  = "tcp"
  from_port                    = 9100
  to_port                      = 9100
  description                  = "node_exporter scraped by Prometheus on the same box"
}

# --- fargate-sg inbound
resource "aws_vpc_security_group_ingress_rule" "fargate_app_metrics" {
  security_group_id            = aws_security_group.fargate.id
  referenced_security_group_id = aws_security_group.obs.id
  ip_protocol                  = "tcp"
  from_port                    = 8000
  to_port                      = 8000
  description                  = "optimizer /metrics from obs-sg"
}

# --- vpce-sg inbound
resource "aws_vpc_security_group_ingress_rule" "vpce_https" {
  security_group_id = aws_security_group.vpce.id
  cidr_ipv4         = var.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS from anywhere inside the VPC"
}

# --- egress: all four may talk out to anywhere
resource "aws_vpc_security_group_egress_rule" "all" {
  for_each = {
    sim     = aws_security_group.sim.id
    obs     = aws_security_group.obs.id
    fargate = aws_security_group.fargate.id
    vpce    = aws_security_group.vpce.id
  }

  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1" # all protocols and ports
  description       = "all egress"
}
