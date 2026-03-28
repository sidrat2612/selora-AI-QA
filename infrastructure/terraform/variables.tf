# ─── General ────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used as resource prefix"
  type        = string
  default     = "selora"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# ─── Domain ─────────────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Root domain name"
  type        = string
  default     = "seloraqa.com"
}

variable "web_subdomain" {
  description = "Subdomain for web app"
  type        = string
  default     = "app"
}

variable "console_subdomain" {
  description = "Subdomain for admin console"
  type        = string
  default     = "console"
}

variable "api_subdomain" {
  description = "Subdomain for API"
  type        = string
  default     = "api"
}

# ─── Secrets (sensitive — no defaults) ──────────────────────────────────────

variable "database_url" {
  description = "Neon Postgres connection string"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Upstash Redis connection string"
  type        = string
  sensitive   = true
}

variable "secret_encryption_key" {
  description = "AES-256 key for encrypting stored secrets (hex, 64 chars)"
  type        = string
  sensitive   = true
}

variable "api_session_secret" {
  description = "Session cookie signing secret"
  type        = string
  sensitive   = true
}

variable "artifact_signing_secret" {
  description = "Secret for signing artifact download URLs"
  type        = string
  sensitive   = true
}

variable "smtp_password" {
  description = "SMTP/SES password (empty if not using email)"
  type        = string
  sensitive   = true
  default     = ""
}

# ─── Application Config ────────────────────────────────────────────────────

variable "smtp_host" {
  description = "SMTP host (e.g. email-smtp.us-east-1.amazonaws.com for SES)"
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP port"
  type        = string
  default     = "587"
}

variable "smtp_from" {
  description = "From address for outgoing emails"
  type        = string
  default     = "noreply@seloraqa.com"
}

variable "smtp_user" {
  description = "SMTP username"
  type        = string
  default     = ""
}

variable "api_rate_limit_user_per_minute" {
  description = "Max API requests per user per minute"
  type        = string
  default     = "60"
}

variable "api_rate_limit_tenant_per_minute" {
  description = "Max API requests per tenant per minute"
  type        = string
  default     = "600"
}

variable "ai_llm_timeout_ms" {
  description = "LLM request timeout in milliseconds"
  type        = string
  default     = "120000"
}

variable "execution_timeout_ms" {
  description = "Test execution timeout in milliseconds"
  type        = string
  default     = "120000"
}

variable "validation_timeout_ms" {
  description = "Test validation timeout in milliseconds"
  type        = string
  default     = "60000"
}

variable "artifact_download_ttl_seconds" {
  description = "TTL for pre-signed artifact download URLs"
  type        = string
  default     = "900"
}

# ─── App Runner Sizing ─────────────────────────────────────────────────────

variable "api_cpu" {
  description = "App Runner vCPU units (1024 = 1 vCPU)"
  type        = string
  default     = "1024"
}

variable "api_memory" {
  description = "App Runner memory in MB"
  type        = string
  default     = "2048"
}

variable "api_max_instances" {
  description = "Maximum App Runner instances"
  type        = number
  default     = 2
}

variable "api_max_concurrency" {
  description = "Max concurrent requests per App Runner instance"
  type        = number
  default     = 100
}

# ─── Worker Sizing (ECS Fargate) ───────────────────────────────────────────

variable "worker_execution_cpu" {
  description = "Worker-execution CPU units (Playwright needs 2048+)"
  type        = string
  default     = "2048"
}

variable "worker_execution_memory" {
  description = "Worker-execution memory in MB (Playwright needs 4096+)"
  type        = string
  default     = "4096"
}

variable "worker_ingestion_cpu" {
  description = "Worker-ingestion CPU units"
  type        = string
  default     = "1024"
}

variable "worker_ingestion_memory" {
  description = "Worker-ingestion memory in MB"
  type        = string
  default     = "2048"
}

variable "worker_ai_repair_cpu" {
  description = "Worker-ai-repair CPU units"
  type        = string
  default     = "512"
}

variable "worker_ai_repair_memory" {
  description = "Worker-ai-repair memory in MB"
  type        = string
  default     = "1024"
}
