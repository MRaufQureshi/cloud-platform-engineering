# modules/simulator/certs.tf
#
# Each device's certificate and private key live in SSM Parameter Store, and the
# instance reads them at boot. Why not paste them into user_data? user_data is
# readable by anyone who can describe the instance, and it is not encrypted.
# A SecureString parameter is encrypted with a KMS key and readable only by
# identities the IAM policy in iam.tf names.
#
# Parameter names: /theo/devices/<id>/cert  and  /theo/devices/<id>/key

resource "aws_ssm_parameter" "certificate" {
  for_each = toset(var.device_ids)

  name  = "/${var.project_name}/devices/${each.key}/cert"
  type  = "String" # a certificate is public information
  value = var.certificates[each.key].certificate_pem
}

resource "aws_ssm_parameter" "private_key" {
  for_each = toset(var.device_ids)

  name  = "/${var.project_name}/devices/${each.key}/key"
  type  = "SecureString" # encrypted at rest with the AWS-managed aws/ssm key
  value = var.certificates[each.key].private_key
}
