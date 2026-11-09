import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173" + (process.env.TEST_BASE_PATH || "/"),
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: [
        "--no-sandbox",
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    env: { VITE_BASE_PATH: process.env.TEST_BASE_PATH || "/" },
    command: process.env.PLAYWRIGHT_PREVIEW
      ? "npm run preview -- --port 4173"
      : "npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173" + (process.env.TEST_BASE_PATH || "/"),
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PREVIEW,
  },
});
