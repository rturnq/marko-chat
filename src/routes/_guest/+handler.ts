import * as v from "valibot";
import { verifyPassword } from "../../server/password";
import { signIn } from "../../server/sign-in";
import { formError } from "../../server/validation";

export const POST = Run.POST(
  {
    form: v.object({
      name: v.pipe(v.string(), v.trim(), v.nonEmpty("Enter your name")),
      password: v.pipe(v.string(), v.nonEmpty("Enter your password")),
    }),
  },
  async (ctx) => {
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

    return signIn(ctx, login.id);
  },
);
