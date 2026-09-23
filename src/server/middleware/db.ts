import type { Context } from "@marko/run";
import { Db } from "../db";
import { connectSqlite } from "../sqlite";

declare module "@marko/run" {
  interface Context {
    db: Db;
  }
}

/**
 * Puts a `Db` on the context; it connects on its first query, not here.
 * `Context<any>` keeps this from depending on the app's route types, which
 * would be circular since those include this middleware.
 */
export default function db(ctx: Context<any>) {
  ctx.db = new Db(connectSqlite);
}
