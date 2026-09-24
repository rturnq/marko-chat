import * as v from "valibot";
import { formError } from "../server/utils/validation";
import { tryGetSameOriginUrl } from "../utils/url";

export const GET = Run.GET(
  {
    search: v.object({
      to: v.optional(v.string()),
    }),
  },
  async (ctx) => {
    if (ctx.session.has("userId")) {
      const returnUrl = tryGetSameOriginUrl(ctx.search[0].to, ctx.url);
      return ctx.redirect(
        returnUrl ||
          Run.href("/channels/$slug", {
            params: { slug: (await ctx.db.getDefaultChannel())!.slug },
          }),
      );
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
    // start early but don't await until we need it.
    const defaultChannel = ctx.db.getDefaultChannel().catch(() => undefined);

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

    const returnUrl = tryGetSameOriginUrl(ctx.search[0].to, ctx.url);
    return ctx.redirect(
      returnUrl ||
        Run.href("/channels/$slug", {
          params: { slug: (await defaultChannel)!.slug },
        }),
    );
  },
);
