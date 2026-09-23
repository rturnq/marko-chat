import * as v from "valibot";
import type { Db } from "../server/db";
import { formError } from "../server/utils/validation";

export const GET = Run.GET(
  {
    search: v.object({
      to: v.optional(v.string()),
    }),
  },
  async (ctx) => {
    if (ctx.session.has("userId")) {
      return ctx.redirect(await getChannelHref(ctx.db, ctx.search[0].to));
    }
  },
);

export const POST = Run.POST(
  {
    search: v.object({
      to: v.optional(v.string()),
    }),
    form: v.object({
      name: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(100)),
    }),
  },
  async (ctx) => {
    const channelHref = getChannelHref(ctx.db, ctx.search[0].to);
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash("POST:/", formError("Invalid login", issues));
      return ctx.redirect(ctx.url);
    }

    let user = await ctx.db.getUserByName(body.name);
    if (!user) {
      try {
        user = await ctx.db.createUser(body.name);
      } catch (err) {
        ctx.session.flash("POST:/", formError(err));
        return ctx.redirect(ctx.url);
      }
    }

    ctx.session.regenerateId();
    ctx.session.set("userId", user.id);

    return ctx.redirect(await channelHref);
  },
);

async function getChannelHref(db: Db, returnUrl?: string) {
  if (returnUrl) {
    return returnUrl;
  }
  const { slug } = await db.getDefaultChannel();
  return Run.href("/channels/$slug", { params: { slug } });
}
