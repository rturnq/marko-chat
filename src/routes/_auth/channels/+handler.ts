import * as v from "valibot";
import { formError } from "../../../server/validation";

export const POST = Run.POST(
  {
    form: v.object({
      name: v.pipe(
        v.string(),
        v.trim(),
        v.minLength(2, "Use 2–50 characters"),
        v.maxLength(50, "Use 2–50 characters"),
      ),
    }),
  },
  async (ctx) => {
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/channels",
        formError("Invalid channel", issues, { name: body.name }),
      );
      return ctx.back();
    }
    try {
      const { slug } = await ctx.db.createChannel(body.name, ctx.data.userId);
      return ctx.redirect(
        Run.href("/channels/$slug", { params: { slug } }),
        303,
      );
    } catch (err) {
      ctx.session.flash(
        "POST:/channels",
        formError(err, undefined, { name: body.name }),
      );
      return ctx.back();
    }
  },
);
