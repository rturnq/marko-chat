import * as v from "valibot";
import { updateMessage, getChannelByMessageId } from "../../../server/db";
import { formError } from "../../../server/utils/validation";

export const POST = Run.POST(
  {
    form: v.object({
      text: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(2000)),
    }),
  },
  async (ctx) => {
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/messages/$id",
        formError("Invalid message", issues),
      );
    } else {
      try {
        const channel = getChannelByMessageId(ctx.params.id);
        await updateMessage(ctx.params.id, ctx.data.userId, body.text);
        const { slug } = (await channel)!;
        return ctx.redirect(Run.href("/channels/$slug", { params: { slug } }));
      } catch (err) {
        ctx.session.flash("POST:/messages/$id", formError(err));
      }
    }
    return ctx.back();
  },
);
