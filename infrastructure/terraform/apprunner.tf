# ─── App Runner (API) ───────────────────────────────────────────────────────
# NestJS API running as a container service.
# Min 1 instance (~$10/mo idle). True $0 requires Lambda — possible future upgrade.
#
# IMPORTANT: Push an image to ECR before first deploy, otherwise the service
# will be created but fail to deploy until an image is available.

resource "aws_apprunner_auto_scaling_configuration_version" "api" {
  auto_scaling_configuration_name = "${local.prefix}-api"
  min_size                        = 1 # App Runner minimum is 1
  max_size                        = var.api_max_instances
  max_concurrency                 = var.api_max_concurrency
}

resource "aws_apprunner_service" "api" {
  service_name = "${local.prefix}-api"

  source_configuration {
    auto_deployments_enabled = false # Deploy via CI/CD, not auto

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_access.arn
    }

    image_repository {
      image_repository_type = "ECR"
      image_identifier      = "${aws_ecr_repository.api.repository_url}:latest"

      image_configuration {
        port = "4000"

        runtime_environment_variables = {
          NODE_ENV                        = "production"
          QUEUE_MODE                      = "sqs"
          API_PORT                        = "4000"
          STORAGE_DRIVER                  = "s3"
          S3_BUCKET                       = aws_s3_bucket.artifacts.id
          S3_REGION                       = var.aws_region
          S3_FORCE_PATH_STYLE             = "false"
          WEB_ORIGIN                      = "https://${local.web_fqdn}"
          API_PUBLIC_ORIGIN               = "https://${local.api_fqdn}"
          API_RATE_LIMIT_USER_PER_MINUTE  = var.api_rate_limit_user_per_minute
          API_RATE_LIMIT_TENANT_PER_MINUTE = var.api_rate_limit_tenant_per_minute
          AI_LLM_TIMEOUT_MS               = var.ai_llm_timeout_ms
          EXECUTION_TIMEOUT_MS             = var.execution_timeout_ms
          VALIDATION_TIMEOUT_MS            = var.validation_timeout_ms
          ARTIFACT_DOWNLOAD_TTL_SECONDS    = var.artifact_download_ttl_seconds
          SMTP_HOST                        = var.smtp_host
          SMTP_PORT                        = var.smtp_port
          SMTP_FROM                        = var.smtp_from
          SMTP_USER                        = var.smtp_user
          # SQS queue URLs for job enqueueing
          SQS_QUEUE_URL_RECORDING_INGESTION = aws_sqs_queue.main["recording_ingestion"].url
          SQS_QUEUE_URL_TEST_EXECUTION      = aws_sqs_queue.main["test_execution"].url
          SQS_QUEUE_URL_TEST_VALIDATION     = aws_sqs_queue.main["test_validation"].url
          SQS_QUEUE_URL_AI_REPAIR           = aws_sqs_queue.main["ai_repair"].url
        }

        runtime_environment_secrets = {
          DATABASE_URL            = aws_secretsmanager_secret.database_url.arn
          REDIS_URL               = aws_secretsmanager_secret.redis_url.arn
          SECRET_ENCRYPTION_KEY   = aws_secretsmanager_secret.secret_encryption_key.arn
          API_SESSION_SECRET      = aws_secretsmanager_secret.api_session_secret.arn
          ARTIFACT_SIGNING_SECRET = aws_secretsmanager_secret.artifact_signing_secret.arn
          SMTP_PASSWORD           = aws_secretsmanager_secret.smtp_password.arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.api_cpu
    memory            = var.api_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.api.arn

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/v1/health/ready"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    interval            = 10
  }

  tags = { Name = "${local.prefix}-api" }
}

# ─── Custom Domain ─────────────────────────────────────────────────────────
# App Runner provisions and manages its own ACM certificate for the custom domain.

resource "aws_apprunner_custom_domain_association" "api" {
  service_arn          = aws_apprunner_service.api.arn
  domain_name          = local.api_fqdn
  enable_www_subdomain = false
}
