import { mkdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { Driver, SqlValue } from "./db";

// Applied once each, in file name order, and recorded in the `migrations` table.
const MIGRATIONS = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

let driver: Driver | undefined;

/** The process's `node:sqlite` connection, opened and migrated on first use. */
export function connectSqlite(): Driver {
  return (driver ??= createDriver(
    process.env.DATABASE_PATH ?? "data/chat.db",
  ));
}

function createDriver(path: string): Driver {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
  });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
  migrate(db);

  // Queries are string constants, so this holds one statement per query.
  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string) => {
    let statement = statements.get(sql);
    if (!statement) {
      statements.set(sql, (statement = db.prepare(sql)));
    }
    return statement;
  };
  const run = (sql: string, params: SqlValue[]) => ({
    changes: Number(prepare(sql).run(...params).changes),
  });

  return {
    async first<Row>(sql: string, ...params: SqlValue[]) {
      return prepare(sql).get(...params) as Row | undefined;
    },
    async all<Row>(sql: string, ...params: SqlValue[]) {
      return prepare(sql).all(...params) as Row[];
    },
    async run(sql, ...params) {
      return run(sql, params);
    },
    async batch(statements) {
      return transaction(db, () =>
        statements.map(([sql, ...params]) => run(sql, params)),
      );
    },
  };
}

function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    ) STRICT
  `);
  const applied = new Set(
    db
      .prepare("SELECT name FROM migrations")
      .all()
      .map(({ name }) => name),
  );
  const insertMigration = db.prepare(
    "INSERT INTO migrations (name, applied_at) VALUES (?, ?)",
  );
  for (const file of Object.keys(MIGRATIONS).sort()) {
    const name = basename(file);
    if (!applied.has(name)) {
      transaction(db, () => {
        db.exec(MIGRATIONS[file]);
        insertMigration.run(name, Date.now());
      });
    }
  }
}
