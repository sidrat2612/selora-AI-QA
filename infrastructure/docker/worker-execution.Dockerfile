# Worker-execution no longer runs Playwright directly — it spawns ephemeral
# playwright-runner containers via Docker socket.  A lightweight Node image
# with Docker CLI is all that's needed.
FROM node:20-slim AS base

# Trust corporate Zscaler root CA for TLS inspection
COPY infrastructure/certs/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && update-ca-certificates \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-execution/package.json ./apps/worker-execution/
COPY packages/database/package.json ./packages/database/
COPY packages/executor/package.json ./packages/executor/
COPY packages/queue/package.json ./packages/queue/
COPY packages/storage/package.json ./packages/storage/
COPY packages/test-validator/package.json ./packages/test-validator/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source
COPY packages/database ./packages/database
COPY packages/executor ./packages/executor
COPY packages/queue ./packages/queue
COPY packages/storage ./packages/storage
COPY packages/test-validator ./packages/test-validator
COPY apps/worker-execution ./apps/worker-execution
COPY tsconfig.base.json ./

# Generate Prisma client
RUN pnpm --filter @selora/database db:generate

CMD ["pnpm", "--filter", "@selora/worker-execution", "dev"]
