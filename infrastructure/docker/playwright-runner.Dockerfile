# Dedicated ephemeral Playwright runner image.
# Worker-execution spawns containers from this image to run generated tests
# in full browser isolation without polluting the worker environment.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

# Trust corporate Zscaler root CA for TLS inspection
COPY infrastructure/certs/zscaler.crt /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

RUN npm install -g @playwright/test@1.58.2

# Make globally-installed packages resolvable from test specs in /test
ENV NODE_PATH=/usr/lib/node_modules

# Copy entrypoint
COPY infrastructure/docker/playwright-runner-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /test

ENTRYPOINT ["/entrypoint.sh"]
