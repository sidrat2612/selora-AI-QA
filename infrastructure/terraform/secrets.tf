# ─── Secrets Manager (sensitive values, ~$0.40/secret/month) ────────────────

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "/${local.prefix}/database-url"
  description             = "Neon Postgres connection string"
  recovery_window_in_days = 0 # Allow immediate deletion in dev
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

resource "aws_secretsmanager_secret" "redis_url" {
  name                    = "/${local.prefix}/redis-url"
  description             = "Upstash Redis connection string"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "redis_url" {
  secret_id     = aws_secretsmanager_secret.redis_url.id
  secret_string = var.redis_url
}

resource "aws_secretsmanager_secret" "secret_encryption_key" {
  name                    = "/${local.prefix}/secret-encryption-key"
  description             = "AES-256 key for encrypting LLM API keys"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "secret_encryption_key" {
  secret_id     = aws_secretsmanager_secret.secret_encryption_key.id
  secret_string = var.secret_encryption_key
}

resource "aws_secretsmanager_secret" "api_session_secret" {
  name                    = "/${local.prefix}/api-session-secret"
  description             = "Session cookie signing secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "api_session_secret" {
  secret_id     = aws_secretsmanager_secret.api_session_secret.id
  secret_string = var.api_session_secret
}

resource "aws_secretsmanager_secret" "artifact_signing_secret" {
  name                    = "/${local.prefix}/artifact-signing-secret"
  description             = "Secret for signing artifact download URLs"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "artifact_signing_secret" {
  secret_id     = aws_secretsmanager_secret.artifact_signing_secret.id
  secret_string = var.artifact_signing_secret
}

resource "aws_secretsmanager_secret" "smtp_password" {
  name                    = "/${local.prefix}/smtp-password"
  description             = "SMTP/SES password"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "smtp_password" {
  secret_id     = aws_secretsmanager_secret.smtp_password.id
  secret_string = var.smtp_password
}
