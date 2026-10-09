# modules/optimizer/ecr.tf
#
# The registry that holds the optimizer image. Same settings as infra/ecs-fargate:
#   IMMUTABLE tags    a tag, once pushed, can never be overwritten. "abc123" always
#                     means the same bits, so a deploy is reproducible.
#   force_delete      `terraform destroy` removes the repo even with images in it.
#
# Vulnerability scanning arrives in Phase 7 as Inspector enhanced scanning
# (account-wide, like infra/ecs-fargate/inspector.tf).

resource "aws_ecr_repository" "optimizer" {
  name                 = "${var.project_name}-optimizer"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true
}
