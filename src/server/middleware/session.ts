import { createCookie } from "@remix-run/cookie";
import { createCookieSessionStorage } from "@remix-run/session/cookie-storage";
import { session } from "@remix-run/session-middleware";
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
// Never Secure, for now, while the app is only served over plain HTTP:
// Safari drops a Secure cookie set over HTTP, even from localhost. Turn this
// back on (or leave it unset, for Secure over HTTPS) before deploying.
const cookie = createCookie("$", {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
  sameSite: "Lax",
  secrets: [
    process.env.SESSION_SECRET ?? "development-only-change-before-deploying",
  ],
  secure: false,
});

export default session(cookie, storage);
