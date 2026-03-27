# ─── ECS Cluster + Worker Services ──────────────────────────────────────────
# Workers run as ECS Services on Fargate Spot (desired count managed by auto-scaling).
# When SQS queues are empty, services scale to 0 tasks → $0 cost.

resource "aws_ecs_cluster" "workers" {
  name = "${local.prefix}-workers"

  setting {
    name  = "containerInsights"
    value = "disabled" # Save costs — enable for production debugging
  }
}

resource "aws_ecs_cluster_capacity_providers" "workers" {
  cluster_name       = aws_ecs_cluster.workers.name
  capacity_providers = ["FARGATE_SPOT", "FARGATE"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }
}

# ═══════════════════════════════════════════════════════════════════════════
# Common environment variables + secrets used by all workers
# ═══════════════════════════════════════════════════════════════════════════

locals {
  worker_common_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "QUEUE_MODE", value = "sqs" },
    { name = "STORAGE_DRIVER", value = "s3" },
    { name = "S3_BUCKET", value = aws_s3_bucket.artifacts.id },
    { name = "S3_REGION", value = var.aws_region },
    { name = "S3_FORCE_PATH_STYLE", value = "false" },
    { name = "AI_LLM_TIMEOUT_MS", value = var.ai_llm_timeout_ms },
  ]

  worker_common_secrets = [
    { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
    { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
    { name = "SECRET_ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.secret_encryption_key.arn },
  ]

  worker_log_config = {
    logDriver = "awslogs"
    options = {
      "awslogs-group"  = aws_cloudwatch_log_group.workers.name
      "awslogs-region" = var.aws_region
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════
# Worker: Execution (runs Playwright tests)
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_ecs_task_definition" "worker_execution" {
  family                   = "${local.prefix}-worker-execution"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_execution_cpu
  memory                   = var.worker_execution_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker-execution"
    image     = "${aws_ecr_repository.worker_execution.repository_url}:latest"
    essential = true

    environment = concat(local.worker_common_env, [
      { name = "EXECUTION_TIMEOUT_MS", value = var.execution_timeout_ms },
      { name = "VALIDATION_TIMEOUT_MS", value = var.validation_timeout_ms },
      { name = "SQS_QUEUE_URL_TEST_EXECUTION", value = aws_sqs_queue.main["test_execution"].url },
      { name = "SQS_QUEUE_URL_TEST_VALIDATION", value = aws_sqs_queue.main["test_validation"].url },
    ])

    secrets = local.worker_common_secrets

    logConfiguration = merge(local.worker_log_config, {
      options = merge(local.worker_log_config.options, {
        "awslogs-stream-prefix" = "execution"
      })
    })
  }])
}

resource "aws_ecs_service" "worker_execution" {
  name            = "${local.prefix}-worker-execution"
  cluster         = aws_ecs_cluster.workers.id
  task_definition = aws_ecs_task_definition.worker_execution.arn
  desired_count   = 0 # Managed by auto-scaling

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.workers.id]
    assign_public_ip = true # Required for internet access without NAT
  }

  lifecycle {
    ignore_changes = [desired_count] # Auto-scaling manages this
  }
}

# ═══════════════════════════════════════════════════════════════════════════
# Worker: Ingestion (processes recordings with Playwright)
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_ecs_task_definition" "worker_ingestion" {
  family                   = "${local.prefix}-worker-ingestion"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_ingestion_cpu
  memory                   = var.worker_ingestion_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker-ingestion"
    image     = "${aws_ecr_repository.worker_ingestion.repository_url}:latest"
    essential = true

    environment = concat(local.worker_common_env, [
      { name = "SQS_QUEUE_URL_RECORDING_INGESTION", value = aws_sqs_queue.main["recording_ingestion"].url },
    ])

    secrets = local.worker_common_secrets

    logConfiguration = merge(local.worker_log_config, {
      options = merge(local.worker_log_config.options, {
        "awslogs-stream-prefix" = "ingestion"
      })
    })
  }])
}

resource "aws_ecs_service" "worker_ingestion" {
  name            = "${local.prefix}-worker-ingestion"
  cluster         = aws_ecs_cluster.workers.id
  task_definition = aws_ecs_task_definition.worker_ingestion.arn
  desired_count   = 0

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.workers.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

# ═══════════════════════════════════════════════════════════════════════════
# Worker: AI Repair
# ═══════════════════════════════════════════════════════════════════════════

resource "aws_ecs_task_definition" "worker_ai_repair" {
  family                   = "${local.prefix}-worker-ai-repair"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_ai_repair_cpu
  memory                   = var.worker_ai_repair_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "worker-ai-repair"
    image     = "${aws_ecr_repository.worker_ai_repair.repository_url}:latest"
    essential = true

    environment = concat(local.worker_common_env, [
      { name = "SQS_QUEUE_URL_AI_REPAIR", value = aws_sqs_queue.main["ai_repair"].url },
    ])

    secrets = local.worker_common_secrets

    logConfiguration = merge(local.worker_log_config, {
      options = merge(local.worker_log_config.options, {
        "awslogs-stream-prefix" = "ai-repair"
      })
    })
  }])
}

resource "aws_ecs_service" "worker_ai_repair" {
  name            = "${local.prefix}-worker-ai-repair"
  cluster         = aws_ecs_cluster.workers.id
  task_definition = aws_ecs_task_definition.worker_ai_repair.arn
  desired_count   = 0

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.workers.id]
    assign_public_ip = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}
