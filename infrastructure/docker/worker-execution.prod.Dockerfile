# ── Worker Execution — Production Dockerfile ────────────────────────────────
# Playwright browsers baked in (no Docker-in-Docker needed on Fargate).
# Usage: docker build -f infrastructure/docker/worker-execution.prod.Dockerfile -t selora-worker-execution .

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies (copy all workspace packages for correct resolution)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-execution/package.json ./apps/worker-execution/
COPY packages/ ./packages/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy app source
COPY apps/worker-execution ./apps/worker-execution

# Generate Prisma client + build all deps + worker
RUN pnpm --filter @selora/database db:generate
RUN pnpm --filter @selora/worker-execution... build

# ── Runtime ─────────────────────────────────────────────────────────────────
# Playwright base image includes browsers + OS deps
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runtime

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.7.0 --activate
# Install Playwright test runner globally (for running generated tests)
RUN npm install -g @playwright/test@1.58.2

WORKDIR /app

# Copy package files and install production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-execution/package.json ./apps/worker-execution/
COPY --from=builder /app/packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod

# Copy built output
COPY --from=builder /app/apps/worker-execution/dist ./apps/worker-execution/dist

# Re-generate Prisma client for runtime OS
RUN pnpm --filter @selora/database db:generate

ENV NODE_ENV=production
ENV NODE_PATH=/usr/lib/node_modules

CMD ["node", "apps/worker-execution/dist/main.js"]
