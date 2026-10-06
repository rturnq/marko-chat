// The adapter's build side, imported by vite.config.ts; runtime.ts holds
// what the Worker itself imports. Both are written to be published as a
// package once marko-run has a Cloudflare adapter of its own.
//
// Vendored from marko-js/run branch claude/cloudflare-vite-plugin-ywixts
// (packages/adapters/cloudflare) with changes to feed back upstream: the
// Worker's `main` is the entry marko-run is given (`marko-run build
// src/index.ts`), so a Worker can export Durable Object classes; `startDev`
// runs Vite's dev server with the Cloudflare plugin (the Worker in workerd,
// HMR for the client), with the `@marko/run/router` import aliased to the
// generated router so the Worker entry gets the real one; `startPreview` runs
// wrangler dev on the build. Replace with @marko/run-adapter-cloudflare once
// published with those. It also needs marko-run to hand `plugins` the entry,
// which patches/@marko__run@0.11.12.patch does until marko-run does itself.
import fs from "node:fs";
import path from "node:path";
import type { Adapter } from "@marko/run/vite";
import type { Plugin } from "vite";

const COMPATIBILITY_DATE = "2025-09-01";

/**
 * What the Worker hands the routes on `ctx.platform`. Empty here: the app
 * adds its own members by augmenting this module, and `typeInfo` makes the
 * result marko-run's `Platform`.
 */
export interface CloudflarePlatform {}

export default function cloudflareAdapter(): Adapter {
  // marko-run loads the Vite config, and with it a new adapter, for the CLI
  // and again for each build and the dev server. The CLI's one gets
  // `plugins`, `startDev` and `startPreview`; the others get the hooks
  // marko-run's Vite plugin calls. `configure` comes first in every one.
  let root = process.cwd();
  let isBuild = false;
  return {
    name: "cloudflare-adapter",
    configure(options) {
      root = options.root;
      isBuild = options.isBuild;
    },
    viteConfig() {
      // In dev the marko-run plugin hands the real generated router only to
      // its own dev entry (root/index.html) and a stub that throws to
      // everything else — the Node adapter loads the router itself and reads
      // it off globalThis. Inside workerd the Worker entry is the one
      // importing it, so alias the import to the plugin's own virtual id for
      // the generated router, which it resolves for any importer; aliases
      // apply ahead of every plugin's resolveId.
      if (!isBuild) {
        return {
          resolve: {
            alias: [
              {
                find: /^@marko\/run\/router$/,
                replacement: "virtual:marko-run/__marko-run__router.js",
              },
            ],
          },
        };
      }
    },
    // `entry` is the one marko-run was given (`marko-run build src/index.ts`)
    // or got from `getEntryFile`. Without one, the Worker's `main` is
    // whatever the Wrangler config says.
    async plugins({ entry }) {
      const { cloudflare } = await import("@cloudflare/vite-plugin");
      return cloudflare({
        viteEnvironment: { name: "ssr" },
        config(workerConfig) {
          const overrides: Record<string, unknown> = {};
          if (entry) {
            overrides.main = path.resolve(root, entry);
          }
          if (!workerConfig.compatibility_date) {
            overrides.compatibility_date = COMPATIBILITY_DATE;
          }
          if (!workerConfig.compatibility_flags?.length) {
            overrides.compatibility_flags = ["nodejs_compat"];
          }
          if (!workerConfig.assets?.binding) {
            overrides.assets = { binding: "ASSETS" };
          }
          return overrides;
        },
      }) as Plugin[];
    },
    // `marko-run dev`: Vite's dev server with the Cloudflare plugin, which
    // runs the Worker (and its Durable Objects, D1, alarms) inside workerd
    // with HMR for the client.
    async startDev({ config, options }) {
      const { createServer } = await import("vite");
      const server = await createServer({
        ...config,
        server: { ...config.server, port: options.port, strictPort: true },
      });
      await server.listen();
      server.printUrls();
      return {
        port: server.config.server.port ?? options.port ?? 0,
        close: () => server.close(),
      };
    },
    // `marko-run preview`: wrangler dev on the built output, which is what
    // `wrangler deploy` ships. Vite's `preview` (falling back to `server`)
    // `host` and `https` carry over, so one config covers dev and preview:
    // a host means every interface, and a key + cert pair means TLS.
    async startPreview({ options }) {
      const { spawn } = await import("node:child_process");
      const { resolveConfig } = await import("vite");
      const config = await resolveConfig(
        { root: options.cwd, logLevel: "silent" },
        "serve",
      );
      const port = options.port ?? 8787;
      const args = [...(options.args ?? [])];
      if (!args.includes("--port")) args.push("--port", String(port));
      const host = config.preview.host ?? config.server.host;
      if (host && !args.includes("--ip")) {
        args.push("--ip", host === true ? "0.0.0.0" : host);
      }
      const https = config.preview.https ?? config.server.https;
      if (https?.key && https?.cert && !args.includes("--local-protocol")) {
        const dir = path.join(config.cacheDir, "cloudflare-preview");
        fs.mkdirSync(dir, { recursive: true });
        const file = (name: string, value: string | Buffer | unknown[]) => {
          const f = path.join(dir, name);
          fs.writeFileSync(f, value as string);
          return f;
        };
        args.push(
          "--local-protocol",
          "https",
          "--https-key-path",
          file("key.pem", https.key),
          "--https-cert-path",
          file("cert.pem", https.cert),
        );
      }
      const child = spawn("wrangler", ["dev", ...args], {
        cwd: options.cwd,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      return {
        port,
        close: () => {
          child.kill();
        },
      };
    },
    buildEnd({ config }) {
      const out = path.resolve(config.root, config.build.outDir);
      const root = out.endsWith(path.join("public", "client"))
        ? path.dirname(path.dirname(out))
        : out;
      const nested = path.join(root, "public", "client");
      if (fs.existsSync(nested)) {
        fs.renameSync(nested, path.join(root, "client"));
        fs.rmdirSync(path.join(root, "public"));
      }
    },
    // Makes `CloudflarePlatform`, as the app augments it, marko-run's
    // `Platform`. marko-run writes this into <root>/.marko-run/routes.d.ts,
    // so the import is relative to there; once published, it becomes an
    // import of the package's name.
    typeInfo(writer) {
      const from = path
        .relative(path.join(root, ".marko-run"), import.meta.dirname)
        .split(path.sep)
        .join("/");
      writer(`import type { CloudflarePlatform } from "${from}";\n`);
      return "CloudflarePlatform";
    },
  };
}
