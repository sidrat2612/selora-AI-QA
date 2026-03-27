# ─────────────────────────────────────────────────────────────────────────────
# Selora — AWS Infrastructure (Scale-to-Zero)
# ─────────────────────────────────────────────────────────────────────────────
#
# Architecture:
#   Frontends  → S3 + CloudFront  (static SPAs, $0 idle)
#   API        → App Runner       (min 1 instance, ~$10/mo idle)
#   Workers    → ECS Fargate Spot (scale 0↔N via SQS depth, $0 idle)
#   Database   → Neon Postgres    (external, scale-to-zero)
#   Cache      → Upstash Redis    (external, serverless)
#   Storage    → S3               (replaces MinIO)
#   Queues     → SQS + DLQs       (replaces BullMQ)
#
# Prerequisites:
#   1. AWS CLI configured with appropriate credentials
#   2. Neon Postgres project created → DATABASE_URL
#   3. Upstash Redis database created → REDIS_URL
#   4. Domain seloratech.com NS records pointed to Route 53
#
# First deploy:
#   terraform init
#   terraform plan -var-file="terraform.tfvars"
#   terraform apply -var-file="terraform.tfvars"
#   # Then push Docker images to ECR and deploy static assets to S3
#
# To use S3 backend (recommended for teams), uncomment the backend block
# and create the bucket/table first:
#   aws s3api create-bucket --bucket selora-terraform-state --region us-east-1
#   aws dynamodb create-table --table-name selora-terraform-locks \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment after creating the state bucket:
  # backend "s3" {
  #   bucket         = "selora-terraform-state"
  #   key            = "infrastructure/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "selora-terraform-locks"
  #   encrypt        = true
  # }
}

# ─── Providers ──────────────────────────────────────────────────────────────

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# CloudFront requires ACM certificates in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ─── Data Sources ───────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── Locals ─────────────────────────────────────────────────────────────────

locals {
  prefix       = "${var.project_name}-${var.environment}"
  account_id   = data.aws_caller_identity.current.account_id
  region       = data.aws_region.current.name
  web_fqdn     = "${var.web_subdomain}.${var.domain_name}"
  console_fqdn = "${var.console_subdomain}.${var.domain_name}"
  api_fqdn     = "${var.api_subdomain}.${var.domain_name}"

  queue_names = {
    recording_ingestion = "recording-ingestion"
    test_validation     = "test-validation"
    test_execution      = "test-execution"
    ai_repair           = "ai-repair"
  }
}
