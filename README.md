# Marko Chat

Chat app MPA: a stub on [Marko 6](https://markojs.com) and [Marko Run](https://markojs.com/docs/marko-run/getting-started/).

Pages are plain forms that post and redirect back, and work without client JS. Where it runs, script makes them
nicer: Enter sends a message or saves an edit (Shift+Enter adds a line), Escape cancels an edit, Send and Save
stay disabled while there's nothing to send, editing opens in place, and a
dialog the server rendered open becomes a modal. Data lives in SQLite (Node's built-in `node:sqlite`) at
`data/chat.db`; set `DATABASE_PATH` to use another file.

People sign up with a name and password and log in with them. Passwords are stored as Argon2id hashes, each with
its own random salt, through `hash-wasm`, which runs on Cloudflare Workers as well as Node
(`src/server/password.ts`). A new name is refused if it matches anyone's name or display
name in any case, so nobody can pass as someone else. Users from before passwords have none and can't log in.

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

- Colors, fonts, spacing, radii and the glass are custom properties in `src/styles/global.css`, which also holds
  the resets and the page's background. Spacing is on a 4px unit, controls are 32, 40 or 48 tall, and a corner
  inside another is the outer one less the padding between them.
- Resets sit in the `base` cascade layer and `ui-*` styles in `ui`, so an `app-*` tag's classes win over both,
  as when it passes a `class` to a `ui-*` tag. A stylesheet that uses a layer repeats `@layer base, ui;` first.

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
