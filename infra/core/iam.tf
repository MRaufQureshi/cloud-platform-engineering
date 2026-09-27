# Identity and Access Management (IAM) Role for EC2 to publish CloudWatch metrics
# 3-Steps: Create role, Attach policy, Add role as instance profile

# Creates an IAM role
resource "aws_iam_role" "tf-cloudwatch_agent_role" {
  name = "tf-cloudwatch-agent-role"

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

#Attaches the AWS managed policy CloudWatchAgentServerPolicy to the role created above. 
#This policy grants the necessary permissions for the CloudWatch agent to read system metrics and send them to CloudWatch.
resource "aws_iam_role_policy_attachment" "tf-cloudwatch_agent_policy" {
  role       = aws_iam_role.tf-cloudwatch_agent_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

#Creates an instance profile and associates it with the IAM role.
/*
Explanation:
In AWS, we cannot attach an IAM Role directly to an EC2 instance. 
Instead, we create an Instance Profile.

1. The "Middleman" Role
Think of an IAM Role as a "hat" that defines permissions (e.g., "I am allowed to write to CloudWatch"). 
Think of the EC2 Instance as a "person."

In the AWS architecture, the EC2 instance doesn't have a way to "wear" the hat directly. 
The Instance Profile acts like a "container" or a "hook" that holds the role so that the EC2 instance can use it.

How it works in the workflow:
When you launch an EC2 instance and want it to have specific permissions, the process is:

Create the Role: Define what the permissions are (aws_iam_role). 
Give permissions to the role (aws_iam_role_policy_attachment)
Create the Instance Profile: Create the container/hook (aws_iam_instance_profile).
Attach the Role to the Profile: Put the role inside the container.
Attach the Profile to the EC2: Tell the EC2 instance to use that specific profile.
*/
resource "aws_iam_instance_profile" "tf-cloudwatch_agent_profile" {
  name = "cloudwatch-agent-profile"
  role = aws_iam_role.tf-cloudwatch_agent_role.name
}