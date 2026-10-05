import * as v from "valibot";
import { verifyPassword } from "../../server/password";
import { formError } from "../../server/utils/validation";
import { tryGetSameOriginUrl } from "../../utils/url";

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
      name: v.pipe(v.string(), v.trim(), v.nonEmpty("Enter your name")),
      password: v.pipe(v.string(), v.nonEmpty("Enter your password")),
    }),
  },
  async (ctx) => {
    // start early but don't await until we need it.
    const defaultChannel = ctx.db.getDefaultChannel().catch(() => undefined);

    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/",
        formError("Invalid login", issues, { name: body.name }),
      );
      return ctx.redirect(ctx.url);
    }

    // Checked even without an account, so an unknown name takes as long as a
    // wrong password, and neither says which it was.
    const login = await ctx.db.getLogin(body.name);
    const valid = await verifyPassword(body.password, login?.passwordHash);
    if (!login || !valid) {
      ctx.session.flash(
        "POST:/",
        formError("Wrong name or password", undefined, { name: body.name }),
      );
      return ctx.redirect(ctx.url);
    }

    ctx.session.regenerateId();
    ctx.session.set("userId", login.id);

    const returnUrl = tryGetSameOriginUrl(ctx.search[0].to, ctx.url);
    return ctx.redirect(
      returnUrl ||
        Run.href("/channels/$slug", {
          params: { slug: (await defaultChannel)!.slug },
        }),
    );
  },
);
