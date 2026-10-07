import type { Context } from "@marko/run";
import { tryGetSameOriginUrl } from "../utils/url";

/**
 * Sends someone signed in on from the login and signup pages: to the page in
 * `?to=`, when it's on this site, or else to the default channel.
 */
export async function redirectSignedIn(ctx: Context<any>) {
  const to = tryGetSameOriginUrl(
    ctx.url.searchParams.get("to") ?? undefined,
    ctx.url,
  );
  return ctx.redirect(
    to ??
      Run.href("/channels/$slug", {
        params: { slug: (await ctx.db.getDefaultChannel())!.slug },
      }),
  );
}

/** Signs the session in as a user, and sends them on as above. */
export function signIn(ctx: Context<any>, userId: string) {
  ctx.session.regenerateId();
  ctx.session.set("userId", userId);
  return redirectSignedIn(ctx);
}
