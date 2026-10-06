import { createCookie } from "@remix-run/cookie";
import { createCookieSessionStorage } from "@remix-run/session/cookie-storage";
import { session } from "@remix-run/session-middleware";
import type { Middleware } from "@remix-run/fetch-router";
import type { Session as RemixSession } from "@remix-run/session";
import type { GetContext } from "@marko/run";
import type { FormError } from "../utils/validation";

export type SessionValueData = {
  userId: string;
};

export type SessionFlashData = {
  [
    Ctx in GetContext as Ctx["method"] extends "POST" | "PUT" | "DELETE"
      ? `${Ctx["method"]}:${Ctx["route"]}`
      : never
  ]: FormError;
};

export type SessionData = SessionValueData & SessionFlashData;

export type Session = RemixSession<SessionValueData, SessionFlashData>;

declare module "@marko/run" {
  interface Context {
    session: Session;
  }
}

// Types `$global.session` in tags outside the routes, which see only
// `Marko.Global`; tags read form errors flashed by the handlers from it.
declare global {
  namespace Marko {
    interface Global {
      session?: Session;
    }
  }
}

const storage = createCookieSessionStorage();

// Dev and preview serve over plain HTTP, where a Secure cookie is dropped
// (Safari drops one set over HTTP, even from localhost). Both are build-time
// constants, so a deploy build always sets it.
const secure = !import.meta.env.DEV && !import.meta.env.VITE_PREVIEW;

// The cookie's key: `SESSION_SECRET` in the environment, which on Cloudflare
// is `wrangler secret put SESSION_SECRET` (or `.dev.vars` locally). Dev and
// preview builds fall back to a fixed key; a deploy build refuses to run
// without one.
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (import.meta.env.DEV || import.meta.env.VITE_PREVIEW) {
    return "development-only-change-before-deploying";
  }
  throw new Error(
    "SESSION_SECRET is not set: run `wrangler secret put SESSION_SECRET`",
  );
}

// Built on the first request, once the environment is to hand.
let withSession: Middleware<any> | undefined;

const sessionMiddleware: Middleware<any> = (ctx, next) => {
  withSession ??= session(
    createCookie("$", {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "Lax",
      secrets: [secret()],
      secure,
    }),
    storage,
  );
  return withSession(ctx, next);
};

export default sessionMiddleware;
