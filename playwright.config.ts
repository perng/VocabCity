import { defineConfig } from "@playwright/test";
import collection from "./src/collection.json" with { type: "json" };

// Lost labels change daily; tests start with none blown away so painting clicks open
// their flashcards. Tests of each feature seed their own state.
const now = new Date(), pad = (n: number) => String(n).padStart(2, "0");
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const noLostLabels = { name: "vocabhall.labels.v1", value: JSON.stringify({ day: today, ids: [], restored: [], total: 0 }) };
// Street challenges appear on their own after a while; tests of the feature turn them back on.
const noChallenges = { name: "vocabhall.challenges.v1", value: JSON.stringify({ won: 0, off: true }) };
// The golden painting is chosen daily; tests start with today's already found so no frame shimmers.
const goldenFound = { name: "vocabhall.golden.v1", value: JSON.stringify({ day: today, id: collection.exhibits[0].id, found: true, hints: 0, total: 0 }) };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:5173", localStorage: [noLostLabels, noChallenges, goldenFound] }] },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
