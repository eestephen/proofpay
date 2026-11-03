import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `npm run test:live` runs only *.live.test.ts (real Gemini + PayPal sandbox). `npm test` runs the rest.
const live = process.env.npm_lifecycle_event === "test:live" || Boolean(process.env.LIVE);

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: live ? ["src/**/*.live.test.ts"] : ["src/**/*.test.ts"],
    exclude: live ? ["node_modules/**"] : ["src/**/*.live.test.ts", "node_modules/**"],
    environment: "node",
  },
});
