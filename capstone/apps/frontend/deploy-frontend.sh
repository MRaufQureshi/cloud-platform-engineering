#!/usr/bin/env bash
# Build the web app and publish it: copy to S3, then refresh CloudFront.
# The same script runs on your laptop (`make -C capstone deploy-frontend`) and in CI.
# It finds the bucket and the distribution by name, so it needs no Terraform state.
# config.json is NOT touched here: Terraform owns it.
set -euo pipefail
cd "$(dirname "$0")"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="theo-site-$ACCOUNT"
DIST=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='theo-site'].Id | [0]" --output text)
[ "$DIST" != "None" ] || { echo "No CloudFront distribution 'theo-site': run 'make -C capstone apply' first"; exit 1; }

npm ci
npm run build

# Files in assets/ have a hash in their name and never change: cache them for a year.
# index.html names those files, so a browser must always re-check it.
aws s3 sync dist/assets "s3://$BUCKET/assets" --delete --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache" --content-type "text/html"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" --query "Invalidation.Id" --output text
echo "deployed to $(aws cloudfront list-distributions --query "DistributionList.Items[?Id=='$DIST'].DomainName | [0]" --output text)"
