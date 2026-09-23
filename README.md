# Marko Chat

Chat app MPA + Marko Patch Protocol: a stub on [Marko 6](https://markojs.com) and [Marko Run](https://markojs.com/docs/marko-run/getting-started/),
running the same patched Marko build as `../marko-books`: `marko` and `@marko/compiler` are linked from the
workspace's `../marko` checkout, and `@marko/vite` and `@marko/run` are the same packed tarballs.

The stub is a single page: an in-memory message list and a `<form method="post">` that appends a message and
redirects back (no client JS).

## Run locally

```bash
cp ../marko-books/.marko-src/tarballs/marko-{run,vite}.tgz .marko-src/tarballs/   # once; .marko-src/ is untracked
node scripts/link-marko.mjs   # builds ../marko and stages marko + @marko/compiler under .marko-src/link
pnpm install
pnpm dev
```

After changing Marko source, rerun `node scripts/link-marko.mjs` and restart the dev server.

```bash
pnpm typecheck
pnpm build
pnpm preview
```
