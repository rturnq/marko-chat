import * as v from "valibot";
import { formError } from "../../../../server/utils/validation";

export const GET = Run.GET(
  {
    search: v.object({
      edit: v.optional(v.string()),
    }),
  },
  async (ctx, next) => {
    const { slug } = ctx.params;
    return next({
      channelList: ctx.db.getChannels(),
      activeChannel: ctx.db.getChannelBySlug(slug),
      messages: ctx.db.getMessages(slug).then((page) => page.messages),
      onlineMembers: ctx.db.getOnlineMembers(),
      offlineMembers: ctx.db.getOfflineMembers(),
      editId: ctx.search[0].edit,
    });
  },
);

export const POST = Run.POST(
  {
    form: v.object({
      text: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(2000)),
    }),
  },
  async (ctx) => {
    const { slug } = ctx.params;
    const channel = await ctx.db.getChannelBySlug(slug);
    if (!channel) {
      return new Response(null, { status: 404 });
    }
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash(
        "POST:/channels/$slug",
        formError("Invalid message", issues),
      );
    } else {
      try {
        await ctx.db.createMessage(channel.id, ctx.data.userId, body.text);
      } catch (err) {
        ctx.session.flash("POST:/channels/$slug", formError(err));
      }
    }
    return ctx.redirect(ctx.url, 303);
  },
);
