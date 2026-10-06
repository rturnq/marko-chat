import type { Context } from "@marko/run";
import { Db } from "../db";

declare module "@marko/run" {
  interface Context {
    db: Db;
  }
}

/**
 * Puts a `Db` over the D1 database on the context. `Context<any>` keeps this
 * from depending on the app's route types, which would be circular since
 * those include this middleware.
 */
export default function db(ctx: Context<any>) {
  ctx.db = new Db(ctx.platform.db);
}
