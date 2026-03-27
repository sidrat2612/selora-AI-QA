# ─── CloudWatch Log Groups ──────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/${local.prefix}/api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "workers" {
  name              = "/${local.prefix}/workers"
  retention_in_days = 14
}
