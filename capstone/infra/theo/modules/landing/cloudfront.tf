# modules/landing/cloudfront.tf
#
# Same idea as the web app's CloudFront (modules/frontend): HTTPS with the free
# *.cloudfront.net certificate, and a private bucket that trusts only this distribution.
#
#   browser --HTTPS--> CloudFront --(signed request, OAC)--> private S3 bucket

resource "aws_cloudfront_origin_access_control" "landing" {
  name                              = "${var.project_name}-landing"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "landing" {
  enabled             = true
  comment             = "${var.project_name}-landing" # the deploy workflow finds the distribution by this
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # US/Canada/Europe edges only: the cheapest

  origin {
    domain_name              = aws_s3_bucket.landing.bucket_regional_domain_name
    origin_id                = "landing"
    origin_access_control_id = aws_cloudfront_origin_access_control.landing.id
  }

  default_cache_behavior {
    target_origin_id       = "landing"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed: CachingOptimized
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# The bucket trusts CloudFront, and only THIS distribution.
data "aws_iam_policy_document" "landing" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.landing.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.landing.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "landing" {
  bucket     = aws_s3_bucket.landing.id
  policy     = data.aws_iam_policy_document.landing.json
  depends_on = [aws_s3_bucket_public_access_block.landing]
}
