# Selora — Deployment Guide

This guide covers deploying Selora to AWS using Terraform. The infrastructure is fully codified in `infrastructure/terraform/`.

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) ≥ 1.5
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [Docker](https://docs.docker.com/get-docker/) for building container images
- A registered domain (default: `seloraqa.com`)
- External managed databases:
  - **PostgreSQL** — [Neon](https://neon.tech) or any PostgreSQL 16 provider
  - **Redis** — [Upstash](https://upstash.com) or any Redis 7 provider

---

## Architecture Overview

```
                            ┌─────────────────┐
                            │   Route 53 DNS   │
                            │  seloraqa.com    │
                            └────────┬─────────┘
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │  CloudFront  │ │  CloudFront  │ │  App Runner  │
            │  app.        │ │  console.    │ │  api.        │
            └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                   ▼                ▼                ▼
            ┌──────────┐    ┌──────────┐     ┌──────────────┐
            │  S3 Web  │    │S3 Console│     │  NestJS API  │
            │  Bucket  │    │  Bucket  │     │  (Port 4000) │
            └──────────┘    └──────────┘     └──────┬───────┘
                                                    │
                                              ┌─────┼─────┐
                                              ▼     ▼     ▼
                                          ┌─────┐┌─────┐┌─────┐
                                          │ SQS ││ SQS ││ SQS │
                                          └──┬──┘└──┬──┘└──┬──┘
                                             ▼      ▼      ▼
                                       ┌─────────────────────────┐
                                       │    ECS Fargate Cluster   │
                                       │  ┌─────────┐ ┌────────┐ │
                                       │  │Execution│ │Ingest. │ │
                                       │  └─────────┘ └────────┘ │
                                       │       ┌──────────┐      │
                                       │       │AI Repair │      │
                                       │       └──────────┘      │
                                       └─────────────────────────┘
                                                    │
                                          ┌─────────┼─────────┐
                                          ▼         ▼         ▼
                                     ┌────────┐┌────────┐┌────────┐
                                     │Neon PG ││Upstash ││S3 Arts.│
                                     └────────┘└────────┘└────────┘
```

### AWS Resources Provisioned

| Resource | Service | Purpose |
|---|---|---|
| App Runner | API | Hosts the NestJS REST API |
| ECS Fargate | Workers | Runs 3 worker containers (execution, ingestion, AI repair) |
| ECR | Images | 4 container repositories |
| CloudFront | CDN | Serves frontend SPAs with edge caching |
| S3 | Storage | 3 buckets — web, console, artifacts |
| SQS | Queues | 4 job queues + 4 dead-letter queues |
| Route 53 | DNS | Hosted zone and DNS records |
| ACM | TLS | Managed SSL certificates |
| Secrets Manager | Secrets | 6 encrypted secrets |
| CloudWatch | Logging | Centralized log groups |
| IAM | Access | Service roles and policies |
| VPC | Network | Security groups for worker egress |
| Auto Scaling | Scaling | SQS-driven ECS scaling (scale to zero) |

---

## Step 1 — Configure Terraform Variables

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
# ─── Required ────────────────────────────────────────────────────────
database_url            = "postgresql://user:pass@host/selora?sslmode=require"
redis_url               = "rediss://default:xxx@host:6379"
secret_encryption_key   = "<openssl rand -hex 32>"
api_session_secret      = "<openssl rand -base64 48>"
artifact_signing_secret = "<openssl rand -base64 48>"

# ─── Optional (defaults shown) ───────────────────────────────────────
# aws_region    = "us-east-1"
# environment   = "dev"
# domain_name   = "seloraqa.com"
# smtp_host     = "email-smtp.us-east-1.amazonaws.com"
# smtp_password = ""
```

Generate secrets:

```bash
# Encryption key (64-char hex)
openssl rand -hex 32

# Session / signing secrets
openssl rand -base64 48
```

---

## Step 2 — Initialize and Apply Terraform

```bash
cd infrastructure/terraform

# Initialize providers
terraform init

# Preview what will be created
terraform plan

# Apply infrastructure
terraform apply
```

After apply completes, note the outputs:

```bash
terraform output
```

Key outputs:
- `route53_nameservers` — Set these at your domain registrar
- `ecr_api_url` / `ecr_worker_*_url` — ECR repository URLs for pushing images
- `web_url` / `console_url` / `api_url` — Application URLs
- `sqs_queue_urls` — Queue URLs (automatically configured)
- `ecs_cluster_name` — ECS cluster for workers

---

## Step 3 — Configure DNS

Point your domain registrar's nameservers to the Route 53 values:

```bash
terraform output route53_nameservers
```

Set these NS records at your registrar for `seloraqa.com`. DNS propagation may take up to 48 hours.

### DNS Records Created Automatically

| Subdomain | Type | Target |
|---|---|---|
| `app.seloraqa.com` | A / AAAA | CloudFront (web) |
| `console.seloraqa.com` | A / AAAA | CloudFront (console) |
| `api.seloraqa.com` | CNAME | App Runner |
| ACM validation records | CNAME | Certificate validation |

---

## Step 4 — Build and Push Docker Images

From the repository root:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $(terraform -chdir=infrastructure/terraform output -raw ecr_api_url | cut -d/ -f1)

# Build and push API
docker build -f infrastructure/docker/api.prod.Dockerfile -t selora-api .
docker tag selora-api:latest $(terraform -chdir=infrastructure/terraform output -raw ecr_api_url):latest
docker push $(terraform -chdir=infrastructure/terraform output -raw ecr_api_url):latest

# Build and push Worker: Execution
docker build -f infrastructure/docker/worker-execution.prod.Dockerfile -t selora-worker-execution .
docker tag selora-worker-execution:latest $(terraform -chdir=infrastructure/terraform output -raw ecr_worker_execution_url):latest
docker push $(terraform -chdir=infrastructure/terraform output -raw ecr_worker_execution_url):latest

# Build and push Worker: Ingestion
docker build -f infrastructure/docker/worker-ingestion.prod.Dockerfile -t selora-worker-ingestion .
docker tag selora-worker-ingestion:latest $(terraform -chdir=infrastructure/terraform output -raw ecr_worker_ingestion_url):latest
docker push $(terraform -chdir=infrastructure/terraform output -raw ecr_worker_ingestion_url):latest

# Build and push Worker: AI Repair
docker build -f infrastructure/docker/worker-ai-repair.prod.Dockerfile -t selora-worker-ai-repair .
docker tag selora-worker-ai-repair:latest $(terraform -chdir=infrastructure/terraform output -raw ecr_worker_ai_repair_url):latest
docker push $(terraform -chdir=infrastructure/terraform output -raw ecr_worker_ai_repair_url):latest
```

### Production Dockerfiles

| Dockerfile | Base Image | Notes |
|---|---|---|
| `api.prod.Dockerfile` | `node:20-alpine` | Multi-stage build, slim runtime |
| `worker-execution.prod.Dockerfile` | Playwright image | Browsers baked in for Fargate |
| `worker-ingestion.prod.Dockerfile` | Playwright image | Browser-based recording ingestion |
| `worker-ai-repair.prod.Dockerfile` | `node:20-alpine` | Lightweight, no browser needed |

---

## Step 5 — Deploy API to App Runner

After pushing the API image, trigger a deployment:

```bash
aws apprunner start-deployment \
  --service-arn $(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='selora-dev-api'].ServiceArn" --output text)
```

App Runner auto-deployments are disabled — deployments are triggered explicitly.

### Health Check

App Runner checks `/api/v1/health/ready` every 10 seconds. The service is marked healthy after 2 consecutive passes and unhealthy after 5 failures.

---

## Step 6 — Deploy Frontend SPAs

Build the frontend apps and sync to S3:

```bash
# Build all packages
pnpm build

# Sync web app to S3
aws s3 sync apps/selora-core/dist/ s3://$(terraform -chdir=infrastructure/terraform output -raw s3_web_bucket)/ \
  --delete --cache-control "public, max-age=31536000, immutable"

# Upload index.html with no-cache (SPA routing)
aws s3 cp apps/selora-core/dist/index.html s3://$(terraform -chdir=infrastructure/terraform output -raw s3_web_bucket)/index.html \
  --cache-control "no-cache, no-store, must-revalidate"

# Sync console app to S3
aws s3 sync apps/selora-console/dist/ s3://$(terraform -chdir=infrastructure/terraform output -raw s3_console_bucket)/ \
  --delete --cache-control "public, max-age=31536000, immutable"

aws s3 cp apps/selora-console/dist/index.html s3://$(terraform -chdir=infrastructure/terraform output -raw s3_console_bucket)/index.html \
  --cache-control "no-cache, no-store, must-revalidate"

# Invalidate CloudFront caches
aws cloudfront create-invalidation \
  --distribution-id $(terraform -chdir=infrastructure/terraform output -raw web_cloudfront_id) \
  --paths "/*"

aws cloudfront create-invalidation \
  --distribution-id $(terraform -chdir=infrastructure/terraform output -raw console_cloudfront_id) \
  --paths "/*"
```

---

## Step 7 — Run Database Migrations

```bash
# Set DATABASE_URL for production
export DATABASE_URL="<your-production-database-url>"

# Deploy migrations
pnpm db:migrate:deploy
```

---

## Step 8 — Deploy Workers

ECS workers start automatically via SQS-driven auto-scaling. After pushing images, force a new deployment:

```bash
CLUSTER=$(terraform -chdir=infrastructure/terraform output -raw ecs_cluster_name)

aws ecs update-service --cluster $CLUSTER --service selora-dev-worker-execution --force-new-deployment
aws ecs update-service --cluster $CLUSTER --service selora-dev-worker-ingestion --force-new-deployment
aws ecs update-service --cluster $CLUSTER --service selora-dev-worker-ai-repair --force-new-deployment
```

### Auto-Scaling Behavior

Workers scale based on SQS queue depth:

| Event | Action | Cooldown |
|---|---|---|
| Queue has ≥ 1 message | Scale to 1 task | 60 seconds |
| Queue empty for 5 minutes | Scale to 0 tasks | 300 seconds |

- **Capacity provider**: Fargate Spot (with Fargate fallback)
- **Max instances**: 2 per worker type
- Workers scale to zero when idle — no cost when no jobs are queued

---

## Terraform Variables Reference

### Required (No Defaults)

| Variable | Description |
|---|---|
| `database_url` | PostgreSQL connection string (Neon recommended) |
| `redis_url` | Redis connection string (Upstash recommended) |
| `secret_encryption_key` | AES-256 hex key (64 chars) |
| `api_session_secret` | Session cookie signing key |
| `artifact_signing_secret` | Artifact URL signing key |

### Optional (With Defaults)

| Variable | Default | Description |
|---|---|---|
| `aws_region` | `us-east-1` | AWS region |
| `environment` | `dev` | Environment name (prefixes all resources) |
| `domain_name` | `seloraqa.com` | Root domain |
| `web_subdomain` | `app` | Frontend subdomain |
| `console_subdomain` | `console` | Admin console subdomain |
| `api_subdomain` | `api` | API subdomain |
| `api_cpu` | `1024` | App Runner CPU (1 vCPU) |
| `api_memory` | `2048` | App Runner memory (MB) |
| `api_max_instances` | `2` | Max App Runner instances |
| `api_max_concurrency` | `100` | Requests per App Runner instance |
| `smtp_host` | `""` | SMTP server host |
| `smtp_port` | `587` | SMTP port |
| `smtp_from` | `noreply@seloraqa.com` | Sender email address |
| `smtp_user` | `""` | SMTP username |
| `smtp_password` | `""` | SMTP password |
| `ai_llm_timeout_ms` | `120000` | LLM request timeout |
| `execution_timeout_ms` | `120000` | Test execution timeout |
| `validation_timeout_ms` | `60000` | Test validation timeout |
| `artifact_download_ttl_seconds` | `900` | Signed URL expiry |

### Worker Sizing

| Worker | CPU | Memory | Notes |
|---|---|---|---|
| Execution | 2048 (2 vCPU) | 4096 MB | Runs Playwright — needs headroom |
| Ingestion | 1024 (1 vCPU) | 2048 MB | Browser-based recording processing |
| AI Repair | 512 (0.5 vCPU) | 1024 MB | Lightweight LLM calls |

---

## SQS Queue Architecture

Each job type has a main queue and a dead-letter queue (DLQ):

| Queue | Visibility Timeout | Retention | DLQ Retention |
|---|---|---|---|
| `recording-ingestion` | 300s | 4 days | 14 days |
| `test-execution` | 300s | 4 days | 14 days |
| `test-validation` | 120s | 4 days | 14 days |
| `ai-repair` | 300s | 4 days | 14 days |

- **Redrive policy**: Messages move to DLQ after 3 failed processing attempts
- **Long polling**: 20-second receive wait time (reduces empty receives and cost)

---

## Secrets Management

Secrets are stored in AWS Secrets Manager (`~$0.40/secret/month`):

| Secret | Path |
|---|---|
| Database URL | `/{prefix}/database-url` |
| Redis URL | `/{prefix}/redis-url` |
| Encryption Key | `/{prefix}/secret-encryption-key` |
| Session Secret | `/{prefix}/api-session-secret` |
| Artifact Signing Secret | `/{prefix}/artifact-signing-secret` |
| SMTP Password | `/{prefix}/smtp-password` |

ECS tasks and App Runner access secrets via IAM roles — no plaintext credentials in environment variables.

---

## ECR Image Lifecycle

Each ECR repository retains the **last 5 images** and automatically expires older ones. Security scanning runs on each push.

---

## Monitoring

- **CloudWatch Logs**: All services log to `/selora-{env}/` prefixed log groups
  - API logs: via App Runner
  - Worker logs: `/selora-{env}/workers` with stream prefixes (`execution`, `ingestion`, `ai-repair`)
- **CloudWatch Alarms**: SQS queue depth alarms drive auto-scaling
- **App Runner health checks**: HTTP probe on `/api/v1/health/ready`

---

## Cost Optimization

- **Fargate Spot**: Workers use Spot instances (up to 70% savings) with on-demand fallback
- **Scale to zero**: Workers scale down to 0 tasks when queues are empty
- **CloudFront PriceClass_100**: US + Europe edge locations only (cheapest tier)
- **Managed databases**: Neon + Upstash eliminate self-managed DB infrastructure costs
- **ECR lifecycle**: Old images auto-expire, reducing storage costs

---

## Teardown

To destroy all AWS resources:

```bash
cd infrastructure/terraform
terraform destroy
```

This removes all resources including S3 buckets (force-delete enabled), ECR repositories, and Secrets Manager secrets.
