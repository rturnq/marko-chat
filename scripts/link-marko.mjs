#!/usr/bin/env node
// Links the app's `marko` and `@marko/compiler` to a Marko monorepo checkout
// (the workspace's ../marko by default), so what that checkout builds is what
// the app runs, with no repack:
//
//   node scripts/link-marko.mjs [--src=DIR] [--no-build]
//
// The monorepo's manifests point at src/ until publish and its packages resolve
// each other through its own node_modules, so each package is staged under
// .marko-src/link/node_modules/<name> (a node_modules path, so Vite treats it
// as a dependency): a copy of its published files, a manifest with the
// publish-time fields (`<field>:override`) applied, and a node_modules whose
// Marko entries point at the stagings and whose other entries point at the
// monorepo's installs. package.json links to the stagings. After changing
// Marko, rerun this script (it rebuilds and restages); the dev server picks
// the new files up on restart.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PACKAGES = {
  marko: { dir: 'packages/runtime-tags', staging: 'marko' },
  '@marko/compiler': { dir: 'packages/compiler', staging: '@marko/compiler' },
};
const OVERRIDDEN_FIELDS = ['main', 'module', 'browser', 'exports', 'type'];

const args = process.argv.slice(2);
const appDir = path.resolve(import.meta.dirname, '..');
const srcDir = path.resolve(appDir, args.find(arg => arg.startsWith('--src='))?.slice('--src='.length) ?? '../marko');
const linkDir = path.join(appDir, '.marko-src', 'link', 'node_modules');

if (!fs.existsSync(path.join(srcDir, 'packages/runtime-tags/package.json'))) {
  console.error(`No Marko checkout at ${srcDir} (pass --src=DIR)`);
  process.exit(1);
}

if (!args.includes('--no-build')) {
  console.log(`[link-marko] pnpm run build  (${srcDir})`);
  execSync('pnpm run build', { cwd: srcDir, stdio: 'inherit' });
}

const stagingOf = {
  marko: path.join(linkDir, PACKAGES.marko.staging),
  '@marko/runtime-tags': path.join(linkDir, PACKAGES.marko.staging),
  '@marko/compiler': path.join(linkDir, PACKAGES['@marko/compiler'].staging),
};

for (const [name, { dir, staging }] of Object.entries(PACKAGES)) {
  const packageDir = path.join(srcDir, dir);
  const stagingDir = path.join(linkDir, staging);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  fs.rmSync(stagingDir, { force: true, recursive: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  for (const entry of manifest.files) {
    if (entry.startsWith('!')) continue;
    const from = path.join(packageDir, entry);
    if (!fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(stagingDir, entry), {
      dereference: true,
      filter: source => !/__tests__|meta\..*\.json$|\.tsbuildinfo$/.test(source),
      recursive: true,
    });
  }

  for (const field of OVERRIDDEN_FIELDS) {
    const override = manifest[`${field}:override`];
    if (override !== undefined) manifest[field] = override;
    delete manifest[`${field}:override`];
  }
  manifest.name = name;
  manifest.private = false;
  // Its own devDependencies are the monorepo's business, not the app's.
  delete manifest.devDependencies;
  fs.writeFileSync(path.join(stagingDir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

  stageNodeModules(path.join(packageDir, 'node_modules'), path.join(stagingDir, 'node_modules'));
  console.log(`[link-marko] ${name} -> ${path.relative(appDir, stagingDir)} (${path.relative(appDir, packageDir)})`);
}

function stageNodeModules(from, to, scope = '') {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      stageNodeModules(path.join(from, entry), path.join(to, entry), `${entry}/`);
      continue;
    }
    const name = scope + entry;
    const target = stagingOf[name] ?? fs.realpathSync(path.join(from, entry));
    fs.symlinkSync(target, path.join(to, entry));
  }
}

console.log('[link-marko] done; `pnpm install` if package.json changed, then restart the dev server');
