import * as v from "valibot";
import { UserStatus } from "../../../server/db";
import { formError } from "../../../server/utils/validation";

export const POST = Run.POST(
  {
    form: v.object({
      status: v.pipe(
        v.string(),
        v.toNumber(),
        v.picklist([UserStatus.Offline, UserStatus.Active, UserStatus.Away]),
      ),
    }),
  },
  async (ctx) => {
    const [body, issues] = await ctx.body;
    if (issues) {
      ctx.session.flash("POST:/me/status", formError("Invalid status", issues));
    } else {
      await ctx.db.updateUserStatus(ctx.data.userId, body.status);
    }
    return ctx.back();
  },
);
