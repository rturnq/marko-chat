#!/usr/bin/env node
// Create the D1 database wrangler.toml binds and write its id there, so the
// whole configuration lives in the project. Idempotent: an existing database
// is found by name and reused.
//
//   node scripts/provision.mjs        (needs `wrangler login`, or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DB_NAME = "marko-chat";
const TOML = path.resolve("wrangler.toml");

const wrangler = (...a) =>
  execFileSync("pnpm", ["exec", "wrangler", ...a], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  }).toString();

const list = JSON.parse(wrangler("d1", "list", "--json"));
const found = list.find((d) => d.name === DB_NAME);
let id = found?.uuid;
if (!id) {
  const out = wrangler("d1", "create", DB_NAME);
  id = /database_id\s*=\s*"([^"]+)"/.exec(out)?.[1];
  if (!id) throw new Error(`could not read the database id from:\n${out}`);
}
console.log(`${found ? "found" : "created"} D1 database ${DB_NAME}: ${id}`);

const toml = fs.readFileSync(TOML, "utf8");
const next = toml.replace(/^(database_id\s*=\s*)"[^"]*"/m, `$1"${id}"`);
if (next === toml) console.log("wrangler.toml already up to date");
else {
  fs.writeFileSync(TOML, next);
  console.log("wrote the id to wrangler.toml");
}
