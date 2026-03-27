# ── Worker Ingestion — Production Dockerfile ────────────────────────────────
# Playwright base for browser-based recording ingestion.
# Usage: docker build -f infrastructure/docker/worker-ingestion.prod.Dockerfile -t selora-worker-ingestion .

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies (copy all workspace packages for correct resolution)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-ingestion/package.json ./apps/worker-ingestion/
COPY packages/ ./packages/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy app source
COPY apps/worker-ingestion ./apps/worker-ingestion

# Generate Prisma client + build all deps + worker
RUN pnpm --filter @selora/database db:generate
RUN pnpm --filter @selora/worker-ingestion... build

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runtime

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Copy package files and install production deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-ingestion/package.json ./apps/worker-ingestion/
COPY --from=builder /app/packages/ ./packages/
RUN pnpm install --frozen-lockfile --prod 2>/dev/null || pnpm install --prod

# Copy built output
COPY --from=builder /app/apps/worker-ingestion/dist ./apps/worker-ingestion/dist

# Re-generate Prisma client for runtime OS
RUN pnpm --filter @selora/database db:generate

ENV NODE_ENV=production

CMD ["node", "apps/worker-ingestion/dist/main.js"]
