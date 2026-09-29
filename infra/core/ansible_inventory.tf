# ==================
# ANSIBLE INVENTORY
# ==================

# Terraform knows the instance's address; Ansible needs it. Instead of copying
# it by hand after every apply, Terraform writes Ansible's inventory itself.
resource "local_file" "ansible_inventory" {
  filename = "${path.module}/../ansible/inventory/hosts.ini"
  file_permission = "0644" # Fix sloppyness

  # The private EC2 has no public IP, so Ansible reaches it through a tunnel.
  # ProxyCommand is how SSH runs that tunnel and connects through it.
  #
  # The tunnel here is the EC2 Instance Connect Endpoint: no bastion, nothing
  # public, and access granted by IAM (ec2-instance-connect:OpenTunnel)
  # instead of by a security group rule. The bastion version is below.
  content = <<-EOF
[database_servers]
db01-tf ansible_host=${aws_instance.tf-ec2-private.private_ip} ansible_user=ec2-user ansible_ssh_private_key_file=~/.ssh/${var.key_pair}.pem ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand="aws ec2-instance-connect open-tunnel --instance-id ${aws_instance.tf-ec2-private.id}"'

EOF
}

# ---------------------------------------------------------------------------
# ALTERNATIVE: tunnel through the public EC2 as a bastion instead of the EIC
# Endpoint. Swap this line into `content` above to use it.
#
# ProxyCommand and not ProxyJump: the bastion gets a new IP on every apply, and
# ProxyJump's inner hop doesn't reliably inherit StrictHostKeyChecking, so it
# fails on the bastion's unrecognized host key. ProxyCommand spells that inner
# ssh call out, so the setting always applies.
#
# db01-tf ansible_host=<private_ip> ansible_user=ec2-user ansible_ssh_private_key_file=~/.ssh/<key>.pem ansible_ssh_common_args='-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -W %h:%p ec2-user@<bastion_public_ip>"'
# ---------------------------------------------------------------------------

output "ansible_ping" {
  description = "Command to verify Ansible can reach the database host"
  value       = "cd infra/ansible && ansible database_servers -m ping"
}
