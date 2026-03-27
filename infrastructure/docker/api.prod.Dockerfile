# ── Selora API — Production Dockerfile ──────────────────────────────────────
# Multi-stage build: install + compile → slim runtime image
# Usage: docker build -f infrastructure/docker/api.prod.Dockerfile -t selora-api .

FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies (copy all workspace packages for correct resolution)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Generate Prisma client + build all packages + API
RUN pnpm --filter @selora/database db:generate
RUN pnpm --filter @selora/api... build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Copy package files and install production deps only
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod

# Copy built output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Re-generate Prisma client for the runtime OS
RUN pnpm --filter @selora/database db:generate

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "apps/api/dist/main"]
