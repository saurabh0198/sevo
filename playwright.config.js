// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.js'),
  fullyParallel: false, // all tests share one throwaway account this round — keep it simple for Phase 1
  retries: 0,
  reporter: 'line',
  timeout: 45000,

  use: {
    baseURL: 'http://localhost:5510',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Chromium only for Phase 1 — "start light, harden over time" per the
  // testing spec's own philosophy. Add firefox/webkit projects later if
  // cross-browser bugs actually show up.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'python -m http.server 5510',
    port: 5510,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
