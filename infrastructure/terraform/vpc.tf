# ─── Default VPC (used by ECS Fargate workers) ─────────────────────────────
# Workers run in the default VPC with public IPs (no NAT Gateway cost).
# They connect outbound to Neon, Upstash, S3, and SQS over the internet.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# Workers accept no inbound traffic — egress only
resource "aws_security_group" "workers" {
  name_prefix = "${local.prefix}-workers-"
  description = "ECS Fargate workers — egress only"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound"
  }

  tags = { Name = "${local.prefix}-workers" }

  lifecycle {
    create_before_destroy = true
  }
}
