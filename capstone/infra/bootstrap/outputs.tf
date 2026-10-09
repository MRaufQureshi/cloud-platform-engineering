# capstone/infra/bootstrap/outputs.tf

output "bucket_name" {
  description = "State bucket for infra/theo"
  value       = aws_s3_bucket.tf_state.bucket
}

output "next_steps" {
  description = "What to do with the bucket name"
  value       = <<-EOT
    # local applies read the bucket from a gitignored file:
    echo 'bucket = "${aws_s3_bucket.tf_state.bucket}"' > ../theo/backend.lab.hcl
    # CI reads it from a repo Variable:
    gh variable set THEO_STATE_BUCKET --body "${aws_s3_bucket.tf_state.bucket}"
    # then run step 3:  make -C capstone init apply
  EOT
}
