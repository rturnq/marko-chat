# Marko Chat

Chat app MPA: a stub on [Marko 6](https://markojs.com) and [Marko Run](https://markojs.com/docs/marko-run/getting-started/).

Pages are plain forms that post and redirect back, and work without client JS. Where it runs, script makes them
nicer: Enter sends a message or saves an edit (Shift+Enter adds a line), Escape cancels an edit, Send and Save
stay disabled while there's nothing to send, editing opens in place, each channel's draft message, and a draft edit,
survive a reload until they're sent, saved, cancelled or deleted, and a dialog the server rendered open becomes a modal.

The app runs on Cloudflare Workers, with its data in a D1 database. Static assets are served by the Worker's
assets binding. An open chat page keeps a WebSocket to a Durable Object, which tells it whenever anything changes,
and the page reloads. `pnpm dev` runs
the Worker locally against a local D1, and each test gets a fresh in-memory D1 from the same local runtime.

People sign up with a name and password and log in with them. Passwords are stored as scrypt hashes, each with
its own random salt (`src/server/password.ts`). A new name is refused if it matches anyone's name or display
name in any case, so nobody can pass as someone else. Users from before passwords have none and can't log in.

Handlers query through `ctx.db` (`src/server/db.ts`), over the D1 database the Worker entry `src/index.ts`
hands the routes on `ctx.platform`. The entry defines that platform's type, and the adapter
(`src/cloudflare-adapter/`, kept to be published as a package) makes it marko-run's. Tests live in `__tests__` folders beside what they
test.

## Tags

Pages are composed from tags in `src/tags/`:

- `app-*` tags render the app's features. They take their data through `input`, may post forms, and read the
  form errors their handlers flash into the session.
- `ui-*` tags are presentational and know nothing about the app beyond their `input`.

Each tag is a folder named after it: `src/tags/<tag>/index.marko`, with its styles in a CSS module,
`style.module.css`, that the template imports.

- Colors, fonts, spacing, radii and the glass are custom properties in `src/routes/style.module.css`, beside the root layout, which also holds
  the resets and the page's background. Spacing is on a 4px unit, controls are 32, 40 or 48 tall, and a corner
  inside another is the outer one less the padding between them.
- Resets sit in the `base` cascade layer and `ui-*` styles in `ui`, so an `app-*` tag's classes win over both,
  as when it passes a `class` to a `ui-*` tag. A stylesheet that uses a layer repeats `@layer base, ui;` first.

## Migrations

Schema changes and seed data are numbered `.sql` files in `src/server/migrations/`. `pnpm db:migrate` applies
the ones not yet applied to the local database, in name order, and `pnpm db:migrate --remote` to the deployed
one; `pnpm db:reset` starts the local database over. The tests apply them to each test's database themselves.
Add a new file rather than editing one that has already run.

## Run locally

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

## Deploy

Once, with `wrangler login` done: `pnpm provision` creates the D1 database and writes its id into
`wrangler.toml`, `pnpm db:migrate --remote` sets up its schema, and `wrangler secret put SESSION_SECRET` gives
the session cookie its key. Then, and after every change:

```bash
pnpm deploy
```
