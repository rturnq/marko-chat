import * as v from "valibot";
import { hashPassword } from "../../../server/password";
import { formError } from "../../../server/utils/validation";
import { tryGetSameOriginUrl } from "../../../utils/url";

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
    form: v.pipe(
      v.object({
        name: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(2, "Use 2–25 characters"),
          v.maxLength(25, "Use 2–25 characters"),
        ),
        password: v.pipe(
          v.string(),
          v.minLength(8, "Use at least 8 characters"),
          v.maxLength(200, "Use at most 200 characters"),
        ),
        confirm: v.string(),
      }),
      v.forward(
        v.partialCheck(
          [["password"], ["confirm"]],
          (input) => input.password === input.confirm,
          "The passwords don't match",
        ),
        ["confirm"],
      ),
    ),
  },
  async (ctx) => {
    // start early but don't await until we need it.
    const defaultChannel = ctx.db.getDefaultChannel().catch(() => undefined);

    // Only the name goes back into the form: passwords are never sent back.
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/signup",
        formError("Invalid sign up", issues, { name: body.name }),
      );
      return ctx.redirect(ctx.url);
    }

    const taken = () => {
      ctx.session.flash("POST:/signup", {
        ...formError("That name is taken", undefined, { name: body.name }),
        fields: { name: "That name is taken" },
      });
      return ctx.redirect(ctx.url);
    };

    // Checked before hashing, which is slow; the insert checks again, in
    // case someone took the name in the meantime.
    if (await ctx.db.isNameTaken(body.name)) {
      return taken();
    }
    const user = await ctx.db.createUser(
      body.name,
      await hashPassword(body.password),
    );
    if (!user) {
      return taken();
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
