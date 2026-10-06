import type { Context, NextFunction } from "@marko/run";
import { Db } from "../db";

declare module "@marko/run" {
  interface Context {
    db: Db;
  }
}

/**
 * Puts a `Db` over the D1 database on the context, and once the request is
 * handled, tells the open pages if it changed any data: once, however many
 * writes it made. `Context<any>` keeps this from depending on the app's route
 * types, which would be circular since those include this middleware.
 */
export default async function db(ctx: Context<any>, next: NextFunction) {
  const { db, updates } = ctx.platform;
  let changed = false;
  ctx.db = new Db(db, () => {
    changed = true;
  });
  try {
    return await next();
  } finally {
    if (changed) {
      updates.changed();
    }
  }
}
