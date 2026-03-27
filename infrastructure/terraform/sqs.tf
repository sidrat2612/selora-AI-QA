# ─── SQS Queues (replace BullMQ) ────────────────────────────────────────────
# 4 queues + 4 dead-letter queues. Workers poll via SQS long polling.

# ─── Dead-Letter Queues ────────────────────────────────────────────────────

resource "aws_sqs_queue" "dlq" {
  for_each = local.queue_names

  name                      = "${local.prefix}-${each.value}-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = { Queue = each.value }
}

# ─── Main Queues ───────────────────────────────────────────────────────────

resource "aws_sqs_queue" "main" {
  for_each = local.queue_names

  name = "${local.prefix}-${each.value}"

  # test-validation runs faster; other queues need more time
  visibility_timeout_seconds = each.key == "test_validation" ? 120 : 300
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 20     # Long polling — reduces empty receives

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = 3
  })

  tags = { Queue = each.value }
}

# ─── DLQ Redrive Permissions ───────────────────────────────────────────────

resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  for_each = local.queue_names

  queue_url = aws_sqs_queue.dlq[each.key].id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.main[each.key].arn]
  })
}
