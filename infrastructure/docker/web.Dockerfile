FROM node:20-alpine AS base

# Trust corporate Zscaler root CA for TLS inspection
COPY infrastructure/certs/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# Copy source
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

EXPOSE 3000
CMD ["pnpm", "--filter", "@selora/web", "dev"]
