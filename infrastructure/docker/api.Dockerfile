FROM node:20-slim AS base

# Trust corporate Zscaler root CA for TLS inspection
COPY infrastructure/certs/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Generate Prisma client
RUN pnpm --filter @selora/database db:generate

EXPOSE 4000
CMD ["pnpm", "--filter", "@selora/api", "dev"]
