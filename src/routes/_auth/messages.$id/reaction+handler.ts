import * as v from "valibot";
import { toggleReaction } from "../../../server/db";
import { formError } from "../../../server/utils/validation";

export const POST = Run.POST(
  {
    form: v.object({
      symbol: v.pipe(v.string(), v.length(2)),
    }),
  },
  async (ctx) => {
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash("POST:/messages/$id/reaction", formError("Invalid reaction", issues));
    } else {
      try {
        await toggleReaction(ctx.params.id, ctx.data.userId, body.symbol);
      } catch (err) {
        ctx.session.flash("POST:/messages/$id/reaction", formError(err));
      }
    }
    return ctx.back();
  },
);
