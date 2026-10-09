# modules/ingestion/outputs.tf

output "price_fetcher_name" {
  description = "aws lambda invoke --function-name <this> out.json"
  value       = aws_lambda_function.price_fetcher.function_name
}

output "forecast_name" {
  value = aws_lambda_function.forecast.function_name
}

output "price_fetcher_log_group" {
  value = aws_cloudwatch_log_group.price_fetcher.name
}
