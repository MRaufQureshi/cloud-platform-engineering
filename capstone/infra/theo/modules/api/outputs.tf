# modules/api/outputs.tf

output "api_url" {
  description = "Base URL of the API (no trailing slash)"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "demo_username" {
  value = aws_cognito_user.demo.username
}

output "demo_temporary_password" {
  description = "First-login password for the demo user (Cognito asks for a new one)"
  value       = random_password.demo.result
  sensitive   = true
}

output "api_function_name" {
  value = aws_lambda_function.api.function_name
}
