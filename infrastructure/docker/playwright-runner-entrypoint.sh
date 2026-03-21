#!/bin/bash
set -e

# Playwright runner entrypoint.
# Expects:
#   /test/generated.spec.ts  — the test file
#   /test/playwright.config.mjs — the Playwright config
# Outputs:
#   /test/report.json         — JSON test report
#   /test/test-results/       — screenshots, traces, etc.
#   Exit code 0 = pass, non-zero = fail

if [ ! -f /test/generated.spec.ts ]; then
  echo "ERROR: /test/generated.spec.ts not found" >&2
  exit 2
fi

if [ ! -f /test/playwright.config.mjs ]; then
  echo "ERROR: /test/playwright.config.mjs not found" >&2
  exit 2
fi

exec npx playwright test /test/generated.spec.ts --config /test/playwright.config.mjs
