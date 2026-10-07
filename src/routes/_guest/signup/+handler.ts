import * as v from "valibot";
import { hashPassword } from "../../../server/password";
import { signIn } from "../../../server/sign-in";
import { formError } from "../../../server/validation";

export const POST = Run.POST(
  {
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
      ctx.session.flash(
        "POST:/signup",
        formError(
          "That name is taken",
          [{ message: "That name is taken", path: ["name"] }],
          { name: body.name },
        ),
      );
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

    return signIn(ctx, user.id);
  },
);
