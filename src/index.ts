// The Worker: it runs the marko-run router, handing the routes the D1
// database on `ctx.platform`, and the assets binding serves client files,
// fonts and the brand art before it runs.
import { fetch as routerFetch } from "@marko/run/router";
import type { CloudflarePlatform } from "./cloudflare-adapter";
import { heldOpen } from "./cloudflare-adapter/runtime";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

declare module "./cloudflare-adapter" {
  interface CloudflarePlatform {
    db: D1Database;
  }
}

export default {
  async fetch(request, env, ctx) {
    const res = await routerFetch<CloudflarePlatform>(request, {
      db: env.DB,
    });
    if (res) {
      // Preview only (a build-time constant, so a deploy build drops this):
      // local workerd's gzip encoder holds a streamed body to the end, so
      // HTML goes out uncompressed there to keep streaming visible. The edge
      // compresses incrementally.
      if (
        import.meta.env.VITE_PREVIEW &&
        res.headers.get("content-type")?.startsWith("text/html")
      ) {
        res.headers.set("content-encoding", "identity");
      }
      return res.body ? heldOpen(res, ctx) : res;
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
