import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:5173", channel: "chrome", ...devices["Desktop Chrome"] },
  webServer: { command: "npm --workspace @pixestudio/desktop run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", reuseExistingServer: true }
});
