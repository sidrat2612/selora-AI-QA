# ─── ECS Auto-Scaling (SQS queue depth → worker desired count) ──────────────
# Scale up when messages appear, scale to 0 when queues empty for 5 minutes.

locals {
  worker_scaling = {
    execution = {
      service_name = aws_ecs_service.worker_execution.name
      queue_key    = "test_execution"
      max_capacity = 2
    }
    ingestion = {
      service_name = aws_ecs_service.worker_ingestion.name
      queue_key    = "recording_ingestion"
      max_capacity = 2
    }
    ai_repair = {
      service_name = aws_ecs_service.worker_ai_repair.name
      queue_key    = "ai_repair"
      max_capacity = 2
    }
  }
}

# ─── Scaling Targets ───────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "workers" {
  for_each = local.worker_scaling

  max_capacity       = each.value.max_capacity
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.workers.name}/${each.value.service_name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# ─── Scale-Up Policies (set desired count to 1 when messages arrive) ───────

resource "aws_appautoscaling_policy" "workers_scale_up" {
  for_each = local.worker_scaling

  name               = "${local.prefix}-${each.key}-scale-up"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.workers[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.workers[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.workers[each.key].service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ExactCapacity"
    cooldown                = 60
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
  }
}

# ─── Scale-Down Policies (set desired count to 0 when queue empties) ───────

resource "aws_appautoscaling_policy" "workers_scale_down" {
  for_each = local.worker_scaling

  name               = "${local.prefix}-${each.key}-scale-down"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.workers[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.workers[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.workers[each.key].service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ExactCapacity"
    cooldown                = 300
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = 0
    }
  }
}

# ─── CloudWatch Alarms (queue has messages → scale up) ─────────────────────

resource "aws_cloudwatch_metric_alarm" "workers_messages_available" {
  for_each = local.worker_scaling

  alarm_name          = "${local.prefix}-${each.key}-queue-has-messages"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1

  alarm_actions = [aws_appautoscaling_policy.workers_scale_up[each.key].arn]

  dimensions = {
    QueueName = aws_sqs_queue.main[each.value.queue_key].name
  }
}

# ─── CloudWatch Alarms (queue empty for 5 min → scale down) ───────────────

resource "aws_cloudwatch_metric_alarm" "workers_queue_empty" {
  for_each = local.worker_scaling

  alarm_name          = "${local.prefix}-${each.key}-queue-empty"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 5 # 5 × 60s = 5 min of empty queue before scaling down
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 1

  alarm_actions = [aws_appautoscaling_policy.workers_scale_down[each.key].arn]

  dimensions = {
    QueueName = aws_sqs_queue.main[each.value.queue_key].name
  }
}
