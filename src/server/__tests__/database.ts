import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";

// Applied in name order, as `pnpm db:migrate` applies them.
const MIGRATIONS = import.meta.glob<string>("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

/**
 * A fresh, migrated D1 database for a test, from the same local runtime that
 * `pnpm dev` uses, kept in memory. Dispose of it when the test is done.
 */
export async function createTestDatabase() {
  const { env, dispose } = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL("./wrangler.jsonc", import.meta.url)),
    persist: false,
  });
  const d1 = env.DB;
  for (const file of Object.keys(MIGRATIONS).sort()) {
    // D1 prepares one statement at a time, and each migration ends its
    // statements with semicolons.
    const statements = MIGRATIONS[file]
      .split(/;\s*$/m)
      .filter((sql) => sql.replace(/--.*$/gm, "").trim());
    await d1.batch(statements.map((sql) => d1.prepare(sql)));
  }
  return {
    d1,
    /** Runs a statement, to set a test up. */
    run: (sql: string, ...params: unknown[]) =>
      d1
        .prepare(sql)
        .bind(...params)
        .run(),
    /** The first row a query returns, to check on a test. */
    first: <Row>(sql: string, ...params: unknown[]) =>
      d1
        .prepare(sql)
        .bind(...params)
        .first<Row>(),
    dispose,
  };
}
