resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.dashboard_name

  dashboard_body = jsonencode({
    widgets = concat(
      [
        # 1. CPU Utilization
        {
          type   = "metric"
          x      = 0
          y      = 0
          width  = 12
          height = 6
          properties = {
            metrics = [
              for id in local.instance_ids : ["AWS/EC2", "CPUUtilization", "InstanceId", id]
            ]
            period = 300
            stat   = "Average"
            region = var.region
            title  = "EC2 CPU Utilization (All Instances)"
            view   = "timeSeries"
          }
        },
        # 2. Memory Utilization (requires CWAgent)
        {
          type   = "metric"
          x      = 12
          y      = 0
          width  = 12
          height = 6
          properties = {
            metrics = [
              for id in local.instance_ids : ["CWAgent", "mem_used_percent", "InstanceId", id]
            ]
            period = 300
            stat   = "Average"
            region = var.region
            title  = "EC2 Memory Utilization (All Instances)"
            view   = "timeSeries"
          }
        },
        # 3. Disk Space Utilization (requires CWAgent + extra dimensions)
        {
          type   = "metric"
          x      = 0
          y      = 6
          width  = 12
          height = 6
          properties = {
            metrics = [
              for id in local.instance_ids : [
                {
                  expression = "SEARCH('{CWAgent,InstanceId,path,fstype,device} MetricName=\"disk_used_percent\" InstanceId=\"${id}\" path=\"/\"', 'Average', 300)"
                  label      = "${id} disk_used_percent"
                  id         = "disk_${replace(id, "-", "_")}"
                }
              ]
            ]
            period = 300
            stat   = "Average"
            region = var.region
            title  = "EC2 Disk Space Utilization (All Instances)"
            view   = "timeSeries"
          }
        },
        # 4. Instance Status Checks
        {
          type   = "metric"
          x      = 12
          y      = 6
          width  = 12
          height = 6
          properties = {
            metrics = [
              for id in local.instance_ids : ["AWS/EC2", "StatusCheckFailed", "InstanceId", id]
            ]
            period = 60
            stat   = "Maximum"
            region = var.region
            title  = "EC2 Instance Status Checks (All Instances)"
            view   = "timeSeries"
          }
        }
      ],
      # 5. Network In (conditional - widget excluded if disabled)
      var.enable_network_monitoring ? [
        {
          type   = "metric"
          x      = 0
          y      = 12
          width  = 12
          height = 6
          properties = {
            metrics = [
              for id in local.instance_ids : ["AWS/EC2", "NetworkIn", "InstanceId", id]
            ]
            period = 300
            stat   = "Average"
            region = var.region
            title  = "EC2 Network In (All Instances)"
            view   = "timeSeries"
          }
        }
      ] : []
    )
  })
}
