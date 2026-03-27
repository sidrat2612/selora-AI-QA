# ─── Outputs ────────────────────────────────────────────────────────────────

# ─── URLs ──────────────────────────────────────────────────────────────────

output "web_url" {
  description = "Web app URL"
  value       = "https://${local.web_fqdn}"
}

output "console_url" {
  description = "Admin console URL"
  value       = "https://${local.console_fqdn}"
}

output "api_url" {
  description = "API URL"
  value       = "https://${local.api_fqdn}"
}

output "api_apprunner_url" {
  description = "App Runner default URL (before DNS propagation)"
  value       = aws_apprunner_service.api.service_url
}

# ─── CloudFront ────────────────────────────────────────────────────────────

output "web_cloudfront_domain" {
  description = "Web CloudFront distribution domain"
  value       = aws_cloudfront_distribution.web.domain_name
}

output "console_cloudfront_domain" {
  description = "Console CloudFront distribution domain"
  value       = aws_cloudfront_distribution.console.domain_name
}

# ─── DNS ───────────────────────────────────────────────────────────────────

output "route53_nameservers" {
  description = "Set these as NS records at your domain registrar"
  value       = aws_route53_zone.main.name_servers
}

# ─── ECR Repositories ─────────────────────────────────────────────────────

output "ecr_api_url" {
  description = "ECR repository URL for API image"
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_execution_url" {
  description = "ECR repository URL for worker-execution image"
  value       = aws_ecr_repository.worker_execution.repository_url
}

output "ecr_worker_ingestion_url" {
  description = "ECR repository URL for worker-ingestion image"
  value       = aws_ecr_repository.worker_ingestion.repository_url
}

output "ecr_worker_ai_repair_url" {
  description = "ECR repository URL for worker-ai-repair image"
  value       = aws_ecr_repository.worker_ai_repair.repository_url
}

# ─── S3 Buckets ────────────────────────────────────────────────────────────

output "s3_web_bucket" {
  description = "S3 bucket for web static assets"
  value       = aws_s3_bucket.web.id
}

output "s3_console_bucket" {
  description = "S3 bucket for console static assets"
  value       = aws_s3_bucket.console.id
}

output "s3_artifacts_bucket" {
  description = "S3 bucket for test artifacts (replaces MinIO)"
  value       = aws_s3_bucket.artifacts.id
}

# ─── SQS Queue URLs ───────────────────────────────────────────────────────

output "sqs_queue_urls" {
  description = "SQS queue URLs (for code reference)"
  value       = { for k, q in aws_sqs_queue.main : k => q.url }
}

# ─── ECS ───────────────────────────────────────────────────────────────────

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.workers.name
}
