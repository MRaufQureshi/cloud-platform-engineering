# ============================================
# Auto Scaling IAM role
# 3-Steps: Create role, Attach policy, Reference role to profile
# ============================================
# Creates an IAM role
resource "aws_iam_role" "auto_scaling_role" {
  name = "auto-scaling-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}
# Policy that grants an EC2 instance the minimum permissions required for core 
# AWS Systems Manager (SSM) service functionality
resource "aws_iam_role_policy_attachment" "auto_scaling_policy" {
  role       = aws_iam_role.auto_scaling_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "auto_scaling_profile" {
  name = "auto-scaling-profile"
  role = aws_iam_role.auto_scaling_role.name
}

# Inline policy 
# it's a policy document embedded directly inside one specific role, with no ARN of its own.
# nothing else in your account needs this exact permission set.
resource "aws_iam_role_policy" "auto_scaling_ec2_actions" {
  name = "auto-scaling-ec2-actions"
  role = aws_iam_role.auto_scaling_role.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:RunInstances",
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
          "ec2:CreateImage",
          "ec2:DescribeImages",
          "ec2:CreateTags"
        ]
        Resource = "*"
      }
    ]
  })
}
