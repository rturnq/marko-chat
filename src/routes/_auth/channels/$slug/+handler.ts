import * as v from "valibot";
import {
  createMessage,
  getChannelBySlug,
  getChannels,
  getMessages,
  getOnlineMembers,
  getOfflineMembers,
} from "../../../../server/db";
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
      channelList: getChannels(),
      activeChannel: getChannelBySlug(slug),
      messages: getMessages(slug),
      onlineMembers: getOnlineMembers(),
      offlineMembers: getOfflineMembers(),
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
    const channel = await getChannelBySlug(slug);
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
        await createMessage(channel.id, ctx.data.userId, body.text);
      } catch (err) {
        ctx.session.flash("POST:/channels/$slug", formError(err));
      }
    }
    return ctx.redirect(ctx.url, 303);
  },
);
