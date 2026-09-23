import { createCookie } from "@remix-run/cookie";
import { createCookieSessionStorage } from "@remix-run/session/cookie-storage";
import { session } from "@remix-run/session-middleware";
import type { Session } from "@remix-run/session";
import type { GetContext } from "@marko/run";
import type { FormError } from "../utils/validation";

type SessionData = {
  userId: string;
};

type FlashData = {
  [
    Ctx in GetContext as Ctx["method"] extends "POST" | "PUT" | "DELETE"
      ? `${Ctx["method"]}:${Ctx["route"]}`
      : never
  ]: FormError;
};

declare module "@marko/run" {
  interface Context {
    session: Session<SessionData, FlashData>;
  }
}

const storage = createCookieSessionStorage();
const cookie = createCookie("$", {
  httpOnly: true,
  maxAge: 60 * 60 * 24 * 30,
  path: "/",
  sameSite: "Lax",
  secrets: [
    process.env.SESSION_SECRET ?? "development-only-change-before-deploying",
  ],
  secure: process.env.NODE_ENV === "production",
});

export default session(cookie, storage);
