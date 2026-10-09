# modules/iot/things_certs.tf
#
# How a device proves who it is to AWS IoT Core:
#
#   THING        the device's entry in the registry (just a name: "device-1")
#   CERTIFICATE  an X.509 certificate + private key. This IS the device's identity:
#                it signs the TLS handshake (mutual TLS: the cloud checks the
#                device, and the device checks the cloud).
#   POLICY       what that certificate is allowed to do (see policies.tf)
#
# Thing --(principal attachment)--> Certificate <--(policy attachment)-- Policy
#
# Terraform creates the certificate, so its PRIVATE KEY ends up in Terraform
# state. The state bucket is private, versioned and encrypted, which is fine for
# a demo; production devices generate their own key and only send a CSR.

resource "aws_iot_thing" "device" {
  for_each = toset(var.device_ids)

  name = each.key
}

resource "aws_iot_certificate" "device" {
  for_each = toset(var.device_ids)

  active = true # an inactive certificate is rejected at connect time
}

resource "aws_iot_thing_principal_attachment" "device" {
  for_each = toset(var.device_ids)

  thing     = aws_iot_thing.device[each.key].name
  principal = aws_iot_certificate.device[each.key].arn
}

# The data endpoint every device connects to: <random>-ats.iot.us-east-1.amazonaws.com
data "aws_iot_endpoint" "data" {
  endpoint_type = "iot:Data-ATS"
}
