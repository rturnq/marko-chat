import * as v from "valibot";
import { formError } from "../../../server/utils/validation";

export const POST = Run.POST(
  {
    form: v.union([
      v.object({
        add: v.pipe(v.string(), v.length(2)),
      }),
      v.object({
        remove: v.pipe(v.string(), v.length(2)),
      }),
    ]),
  },
  async (ctx) => {
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/messages/$id/reaction",
        formError("Invalid reaction", issues),
      );
    } else {
      try {
        if ("remove" in body) {
          await ctx.db.removeReaction(
            ctx.params.id,
            ctx.data.userId,
            body.remove,
          );
        } else {
          await ctx.db.addReaction(ctx.params.id, ctx.data.userId, body.add);
        }
      } catch (err) {
        ctx.session.flash("POST:/messages/$id/reaction", formError(err));
      }
    }
    return ctx.back();
  },
);
