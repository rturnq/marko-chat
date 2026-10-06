#!/usr/bin/env node
// Database setup, outside the running app: the app expects the schema to
// be there.
//
//   node scripts/db.mjs migrate            # apply pending src/server/migrations/*.sql to the local D1
//   node scripts/db.mjs reset              # drop the local D1 and migrate from scratch
//   node scripts/db.mjs migrate --remote   # the deployed database
//
// D1 is driven through wrangler, which records applied files in its own
// d1_migrations table, from the migrations directory named in wrangler.toml.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith("--"));
const remote = args.includes("--remote");
const DB_NAME = "marko-chat";

function wrangler(...a) {
  console.log(`> wrangler ${a.join(" ")}`);
  execFileSync("pnpm", ["exec", "wrangler", ...a], {
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

switch (cmd) {
  case "migrate":
    wrangler(
      "d1",
      "migrations",
      "apply",
      DB_NAME,
      remote ? "--remote" : "--local",
    );
    break;
  case "reset":
    if (remote) {
      // Never drop a deployed database from a script; do it deliberately.
      console.error(
        "reset is local-only. To start the deployed database over: wrangler d1 delete marko-chat && pnpm provision, then migrate with --remote.",
      );
      process.exit(1);
    }
    fs.rmSync(path.resolve(".wrangler/state/v3/d1"), {
      recursive: true,
      force: true,
    });
    console.log("removed .wrangler/state/v3/d1");
    wrangler("d1", "migrations", "apply", DB_NAME, "--local");
    break;
  default:
    console.error("usage: node scripts/db.mjs <migrate|reset> [--remote]");
    process.exit(1);
}
