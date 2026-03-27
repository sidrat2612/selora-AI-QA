# ── Worker AI Repair — Production Dockerfile ────────────────────────────────
# Lightweight — no Playwright needed.
# Usage: docker build -f infrastructure/docker/worker-ai-repair.prod.Dockerfile -t selora-worker-ai-repair .

FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies (copy all workspace packages for correct resolution)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-ai-repair/package.json ./apps/worker-ai-repair/
COPY packages/ ./packages/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Generate Prisma client + build all deps + worker
RUN pnpm --filter @selora/database db:generate
RUN pnpm --filter @selora/worker-ai-repair... build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Copy package files and install production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-ai-repair/package.json ./apps/worker-ai-repair/
COPY --from=builder /app/packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod

# Copy built output
COPY --from=builder /app/apps/worker-ai-repair/dist ./apps/worker-ai-repair/dist

# Re-generate Prisma client for runtime OS
RUN pnpm --filter @selora/database db:generate

ENV NODE_ENV=production

CMD ["node", "apps/worker-ai-repair/dist/main.js"]
