import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:1420', channel: 'chrome', headless: true },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://localhost:1420', reuseExistingServer: false },
});
