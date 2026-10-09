# capstone/infra/prerequisites/outputs.tf

output "plan_role_arn" {
  description = "Role for pull-request plans"
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "Role for apply and destroy (main branch only)"
  value       = aws_iam_role.apply.arn
}

# Copy-paste block: these are the repo Variables the workflows read.
output "next_steps" {
  description = "Paste these into your terminal (needs the gh CLI), or add them in GitHub > Settings > Secrets and variables > Actions > Variables"
  value       = <<-EOT
    gh variable set AWS_THEO_ROLE_APPLY --body "${aws_iam_role.apply.arn}"
    gh variable set AWS_THEO_ROLE_PLAN  --body "${aws_iam_role.plan.arn}"
    # then run step 2:  make -C capstone bootstrap
  EOT
}
