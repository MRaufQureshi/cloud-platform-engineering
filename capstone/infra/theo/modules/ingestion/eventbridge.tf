# modules/ingestion/eventbridge.tf
#
# EventBridge is AWS's scheduler/event bus. A RULE says "at this time (or on this
# event)", a TARGET says "call this". Three pieces make the daily run work:
#
#   rule         cron(5 13 * * ? *) = every day at 13:05 UTC. The day-ahead market
#                publishes tomorrow's prices around 13:00, so 13:05 finds them.
#   target       the price fetcher Lambda
#   permission   EventBridge may INVOKE that Lambda. Without it the rule fires into
#                the void: the most common "why did my schedule never run" mistake.

resource "aws_cloudwatch_event_rule" "daily_prices" {
  name                = "${var.project_name}-daily-prices"
  description         = "Fetch tomorrow's day-ahead prices"
  schedule_expression = var.schedule
}

resource "aws_cloudwatch_event_target" "price_fetcher" {
  rule = aws_cloudwatch_event_rule.daily_prices.name
  arn  = aws_lambda_function.price_fetcher.arn
}

resource "aws_lambda_permission" "from_eventbridge" {
  statement_id  = "AllowDailyRule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.price_fetcher.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_prices.arn # only THIS rule, not any rule
}
