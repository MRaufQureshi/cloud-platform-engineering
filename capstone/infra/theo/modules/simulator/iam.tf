# modules/simulator/iam.tf
#
# The instance's identity. It needs exactly three things:
#   1. SSM core        -> so Session Manager can open a shell (replaces SSH keys)
#   2. read the code   -> s3:GetObject on simulator/* in the data bucket only
#   3. read its certs  -> ssm:GetParameter on /theo/devices/* only

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ec2_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "simulator" {
  name               = "${var.project_name}-simulator"
  assume_role_policy = data.aws_iam_policy_document.ec2_trust.json
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.simulator.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "simulator" {
  name = "read-code-and-certs"
  role = aws_iam_role.simulator.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadSimulatorCode"
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${var.data_bucket_arn}/simulator/*"
      },
      {
        # `aws s3 cp --recursive` lists the prefix first, which needs ListBucket.
        Sid       = "ListSimulatorPrefix"
        Effect    = "Allow"
        Action    = "s3:ListBucket"
        Resource  = var.data_bucket_arn
        Condition = { StringLike = { "s3:prefix" = ["simulator/*"] } }
      },
      {
        Sid      = "ReadDeviceCertificates"
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${var.project_name}/devices/*"
      },
    ]
  })
}

# An instance profile is the wrapper that lets an EC2 instance wear an IAM role.
resource "aws_iam_instance_profile" "simulator" {
  name = "${var.project_name}-simulator"
  role = aws_iam_role.simulator.name
}
