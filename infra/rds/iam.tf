# ============================================
# Aurora IAM role
# 3-Steps: Create role, Attach policy, Reference role to profile
# ============================================
# Creates an IAM role
resource "aws_iam_role" "aurora_agent_role" {
  name = "aurora-agent-role"

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
resource "aws_iam_role_policy_attachment" "aurora_agent_policy" {
  role       = aws_iam_role.aurora_agent_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "aurora_agent_profile" {
  name = "aurora-agent-profile"
  role = aws_iam_role.aurora_agent_role.name
}