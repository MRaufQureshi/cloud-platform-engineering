# modules/api/api_gateway.tf
#
# API Gateway is the front door. A request travels:
#
#   browser --HTTPS--> API Gateway --checks the JWT--> Lambda --> DynamoDB / IoT / SQS
#
# HTTP API (not REST API): cheaper, simpler, and it has a built-in JWT authorizer.
# The default URL (https://<id>.execute-api.<region>.amazonaws.com) is HTTPS with
# AWS's own certificate, so no domain or certificate of yours is needed.

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  # CORS: a browser refuses to let a page on one address call an API on another
  # unless the API says so. These are the ONLY addresses allowed to.
  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET", "POST", "PUT", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

# --- The login check
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  name             = "cognito-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id] # tokens must have been issued to OUR app client
    issuer   = "https://${aws_cognito_user_pool.main.endpoint}"
  }
}

# --- One integration (the Lambda), seven routes pointing at it
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY" # pass the whole request to the Lambda, return its answer as is
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

locals {
  routes = [
    "GET /device/{id}/status",
    "GET /device/{id}/savings",
    "GET /device/{id}/schedule",
    "GET /device/{id}/settings",
    "PUT /device/{id}/settings",
    "POST /device/{id}/plug-in",
    "POST /device/{id}/plug-out",
  ]
}

resource "aws_apigatewayv2_route" "device" {
  for_each = toset(local.routes)

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# --- Access log + the live stage
resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.project_name}-api"
  retention_in_days = 7
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default" # the stage with no name in the URL
  auto_deploy = true

  # Even a logged-in caller cannot flood the API: this caps the request rate.
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  # One JSON line per request. No caller IP: it is personal data, and not needed here.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId  = "$context.requestId"
      route      = "$context.routeKey"
      status     = "$context.status"
      latencyMs  = "$context.responseLatency"
      authError  = "$context.authorizer.error"
      integError = "$context.integrationErrorMessage"
    })
  }
}

# --- API Gateway may call the Lambda. Same idea as EventBridge in modules/ingestion:
# without this resource policy the route exists but every call fails with 500.
resource "aws_lambda_permission" "from_api_gateway" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*" # this API only, any stage, any route
}
