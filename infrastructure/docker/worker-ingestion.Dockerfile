# Use Playwright image for browser runtime dependencies
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS base

# Trust corporate Zscaler root CA for TLS inspection
COPY infrastructure/certs/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/worker-ingestion/package.json ./apps/worker-ingestion/
COPY packages/database/package.json ./packages/database/
COPY packages/queue/package.json ./packages/queue/
COPY packages/recording-ingest/package.json ./packages/recording-ingest/
COPY packages/storage/package.json ./packages/storage/
COPY packages/canonical-tests/package.json ./packages/canonical-tests/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source
COPY packages/database ./packages/database
COPY packages/queue ./packages/queue
COPY packages/recording-ingest ./packages/recording-ingest
COPY packages/storage ./packages/storage
COPY packages/canonical-tests ./packages/canonical-tests
COPY apps/worker-ingestion ./apps/worker-ingestion
COPY tsconfig.base.json ./

# Generate Prisma client
RUN pnpm --filter @selora/database db:generate

CMD ["pnpm", "--filter", "@selora/worker-ingestion", "dev"]