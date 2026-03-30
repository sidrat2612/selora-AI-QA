#!/usr/bin/env bash
set -euo pipefail

# Selora — One-command local setup
# Usage: bash install.sh [--docker]

REPO="https://github.com/sidrat2612/selora-AI-QA.git"
DIR="selora-AI-QA"
DOCKER_MODE=false

for arg in "$@"; do
  case "$arg" in
    --docker) DOCKER_MODE=true ;;
    --help|-h)
      echo "Usage: bash install.sh [--docker]"
      echo ""
      echo "  (default)   Local dev mode — requires Node.js 20+, pnpm 10+"
      echo "  --docker    Full Docker stack — requires Docker & Docker Compose"
      exit 0
      ;;
  esac
done

echo ""
echo "  ____       _                 "
echo " / ___|  ___| | ___  _ __ __ _ "
echo " \___ \ / _ \ |/ _ \| '__/ _\` |"
echo "  ___) |  __/ | (_) | | | (_| |"
echo " |____/ \___|_|\___/|_|  \__,_|"
echo ""
echo " AI-Powered QA Automation Platform"
echo ""

# ── Clone if not already in the repo ──
if [ ! -f "turbo.json" ]; then
  if [ -d "$DIR" ]; then
    echo "→ Directory $DIR already exists, entering..."
    cd "$DIR"
  else
    echo "→ Cloning repository..."
    git clone "$REPO"
    cd "$DIR"
  fi
fi

if [ "$DOCKER_MODE" = true ]; then
  # ── Docker mode ──
  echo "→ Starting full Docker stack (10 services)..."

  if ! command -v docker &>/dev/null; then
    echo "✗ Docker is not installed. Install it from https://docs.docker.com/get-docker/"
    exit 1
  fi

  docker compose up --build -d
  echo ""
  echo "✓ All services starting. Run 'docker compose ps' to check status."
  echo ""
  echo "  Core app:    http://localhost:3000"
  echo "  Console:     http://localhost:3001"
  echo "  API:         http://localhost:4000"
  echo "  Mailpit:     http://localhost:8025"
  echo ""
  echo "  Login: admin@selora.local / admin123"
  echo ""
else
  # ── Local dev mode ──
  echo "→ Checking prerequisites..."

  # Check Node.js
  if ! command -v node &>/dev/null; then
    echo "✗ Node.js is not installed. Install v20+ from https://nodejs.org"
    exit 1
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 20 ]; then
    echo "✗ Node.js $NODE_VERSION found, but 20+ is required."
    exit 1
  fi
  echo "  ✓ Node.js $(node -v)"

  # Check pnpm
  if ! command -v pnpm &>/dev/null; then
    echo "→ Installing pnpm..."
    corepack enable && corepack prepare pnpm@latest --activate
  fi
  echo "  ✓ pnpm $(pnpm -v)"

  # Check Docker (for infra services)
  if ! command -v docker &>/dev/null; then
    echo "✗ Docker is not installed. Needed for PostgreSQL, Redis, MinIO."
    echo "  Install from https://docs.docker.com/get-docker/"
    exit 1
  fi
  echo "  ✓ Docker available"

  # Install dependencies
  echo "→ Installing dependencies..."
  pnpm install

  # Copy env if missing
  if [ ! -f .env.local ]; then
    if [ -f .env.local.example ]; then
      cp .env.local.example .env.local
      echo "  ✓ Created .env.local from example"
    fi
  else
    echo "  ✓ .env.local already exists"
  fi

  # Start infrastructure
  echo "→ Starting infrastructure (PostgreSQL, Redis, MinIO, Mailpit)..."
  docker compose up postgres redis minio mailpit -d

  # Database setup
  echo "→ Setting up database..."
  pnpm db:generate
  pnpm db:migrate:dev
  pnpm db:seed

  echo ""
  echo "✓ Setup complete! Start the dev server with:"
  echo ""
  echo "  pnpm dev"
  echo ""
  echo "  Core app:    http://localhost:3000"
  echo "  Console:     http://localhost:3001"
  echo "  API:         http://localhost:4000"
  echo "  Mailpit:     http://localhost:8025"
  echo "  Prisma Studio: pnpm db:studio"
  echo ""
  echo "  Login: admin@selora.local / admin123"
  echo ""
fi
