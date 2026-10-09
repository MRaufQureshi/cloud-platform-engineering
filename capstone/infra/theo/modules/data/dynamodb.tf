# modules/data/dynamodb.tf
#
# The six DynamoDB tables (BUILD.SPEC section 2.2). DynamoDB has no schema
# beyond the key: every item may carry any other attributes. Each table needs
# only a partition key (hash) and, optionally, a sort key (range). Together they
# identify one item; the sort key lets one partition hold many ordered items.
#
#   table         partition key   sort key      holds
#   device-state  device_id       -             latest SoC / plugged_in / power
#   settings      device_id       -             reserve %, target %, departure time
#   schedules     device_id       slot_start    one item per 15-minute slot
#   prices        date            hour          one item per hour: ct/kWh
#   savings       device_id       date          naive vs optimised cost per day
#   telemetry     device_id       timestamp     raw readings, auto-deleted after 24h
#
# PAY_PER_REQUEST = no capacity to size; you pay per read/write, ~zero at demo
# scale. Point-in-time recovery lets you restore to any second in the last 35 days.

locals {
  tables = {
    device-state = { hash = "device_id", range = null }
    settings     = { hash = "device_id", range = null }
    schedules    = { hash = "device_id", range = "slot_start" }
    prices       = { hash = "date", range = "hour" }
    savings      = { hash = "device_id", range = "date" }
    telemetry    = { hash = "device_id", range = "timestamp" }
  }
}

resource "aws_dynamodb_table" "this" {
  for_each = local.tables

  name         = "${var.project_name}-${each.key}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash
  range_key    = each.value.range

  # Only key attributes are declared. All keys here are strings (S).
  attribute {
    name = each.value.hash
    type = "S"
  }

  dynamic "attribute" {
    for_each = each.value.range == null ? [] : [each.value.range]
    content {
      name = attribute.value
      type = "S"
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  # TTL: DynamoDB deletes an item once the epoch time in its "ttl" attribute
  # passes. Only telemetry uses it, to keep raw readings for 24 hours.
  ttl {
    attribute_name = "ttl"
    enabled        = each.key == "telemetry"
  }
}
