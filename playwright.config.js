const { defineConfig, devices } = require('@playwright/test');
const fs = require('node:fs');

const port = Number(process.env.E2E_PORT || 4174);
const baseURL = `http://127.0.0.1:${port}`;
const workers = 2;
const braveExecutable = process.env.BRAVE_PATH || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const projects = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
];
if (fs.existsSync(braveExecutable)) {
  projects.push({
    name: 'brave',
    use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: braveExecutable } },
  });
}

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `node tools/serve-site.mjs --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
  projects,
});
