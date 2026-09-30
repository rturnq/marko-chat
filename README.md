# Marko Chat

Chat app MPA: a stub on [Marko 6](https://markojs.com) and [Marko Run](https://markojs.com/docs/marko-run/getting-started/).

Pages are plain forms that post and redirect back (no client JS). Data lives in SQLite (Node's built-in
`node:sqlite`) at `data/chat.db`; set `DATABASE_PATH` to use another file.

Handlers query through `ctx.db` (`src/server/db.ts`), which the root middleware adds without connecting: the
connection is made by the first query and awaited by every query. Queries go through a small async `Driver`
interface shaped like Cloudflare D1's; `src/server/sqlite.ts` implements it for `node:sqlite`.

## Tags

Pages are composed from tags in `src/tags/`:

- `app-*` tags render the app's features. They take their data through `input`, may post forms, and read the
  form errors their handlers flash into the session.
- `ui-*` tags are presentational and know nothing about the app beyond their `input`.

Each tag is a folder named after it: `src/tags/<tag>/index.marko`, with its styles in a CSS module,
`style.module.css`, that the template imports.

- Colors, fonts, lines and the halftone are custom properties in `src/styles/global.css`, which also holds the
  resets. `design/` has the static design boards they come from.
- Resets sit in the `base` cascade layer and `ui-*` styles in `ui`, so an `app-*` tag's classes win over both,
  as when it passes a `class` to a `ui-*` tag. A stylesheet that uses a layer repeats `@layer base, ui;` first.
- `ui-*` tags list the attributes they pass to elements rather than spreading `input`: spreading makes Marko
  ship code to the browser in case the input holds event handlers.
- `<@placeholder>` content is shipped to the browser, so placeholders stay plain markup rather than tags.

## Migrations

Schema changes and seed data are numbered `.sql` files in `src/server/migrations/`. On startup, every file not
yet recorded in the `migrations` table is applied in name order, each in its own transaction. Add a new file
rather than editing one that has already run.

## Run locally

```bash
pnpm install
pnpm dev
```

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```
