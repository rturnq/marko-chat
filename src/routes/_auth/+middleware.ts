import { getUser } from "../../server/db";

export default Run.ALL((ctx, next) => {
  const userId = ctx.session.get("userId") as string | undefined;
  if (!userId) {
    const to = Run.href("/", {
      search: { to: ctx.url.pathname + ctx.url.search },
    }) as string;
    return ctx.redirect(to);
  }
  return next({ userId, me: getUser(userId) });
});
