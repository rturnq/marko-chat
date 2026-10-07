import * as v from "valibot";
import { formError } from "../../../server/validation";
import { tryGetSameOriginUrl } from "../../../utils/url";

export const POST = Run.POST(
  {
    form: v.variant("command", [
      v.object({
        command: v.literal("edit"),
        text: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(2, "Write at least 2 characters"),
          v.maxLength(2000, "Keep it under 2000 characters"),
        ),
        returnUrl: v.optional(v.string()),
      }),
      v.object({
        command: v.literal("delete"),
        returnUrl: v.optional(v.string()),
      }),
    ]),
  },
  async (ctx) => {
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/messages/$id",
        formError("Invalid message", issues, body),
      );
    } else {
      try {
        let message;
        if (body.command === "delete") {
          message = await ctx.db.deleteMessage(ctx.params.id, ctx.data.userId);
        } else {
          message = await ctx.db.updateMessage(
            ctx.params.id,
            ctx.data.userId,
            body.text,
          );
        }

        const returnUrl = tryGetSameOriginUrl(body.returnUrl, ctx.url);
        return ctx.redirect(
          returnUrl ||
            Run.href("/channels/$slug", {
              params: { slug: message.channelSlug },
            }),
        );
      } catch (err) {
        ctx.session.flash(
          "POST:/messages/$id",
          formError(err, undefined, body),
        );
      }
    }
    return ctx.back();
  },
);
