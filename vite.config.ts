import marko from "@marko/run/vite";
import { defineConfig } from "vite";
import cloudflareAdapter from "./src/cloudflare-adapter/index.ts";

// One host: a Worker, built through the Cloudflare Vite plugin from the
// entry the package scripts give marko-run (src/index.ts). Dev runs the
// Worker in workerd with HMR for the client, and preview runs wrangler dev
// on the build.
export default defineConfig({
  plugins: [marko({ adapter: cloudflareAdapter() })],
  // Images and icons stay files of their own, cached by their hashed names,
  // rather than inlined into every page or stylesheet that uses them.
  build: { assetsInlineLimit: 0 },
});
