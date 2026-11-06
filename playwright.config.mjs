import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  outputDir: "/tmp/bridge-m4-test-results",
  use: { baseURL: "http://127.0.0.1:3000", reducedMotion: "reduce", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: "npm run start -- --hostname 127.0.0.1", url: "http://127.0.0.1:3000", timeout: 30000, reuseExistingServer: false },
});
