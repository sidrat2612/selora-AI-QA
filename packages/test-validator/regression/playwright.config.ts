import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  testMatch: ['web-regression.spec.ts'],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list']],
  use: {
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});