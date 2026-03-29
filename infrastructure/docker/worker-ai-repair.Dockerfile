FROM node:20-slim AS base

# Trust corporate Zscaler root CA for TLS inspection
COPY infrastructure/certs/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-ai-repair/package.json ./apps/worker-ai-repair/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source
COPY packages/database ./packages/database
COPY apps/worker-ai-repair ./apps/worker-ai-repair
COPY tsconfig.base.json ./

# Generate Prisma client
RUN pnpm --filter @selora/database db:generate

CMD ["pnpm", "--filter", "@selora/worker-ai-repair", "dev"]
