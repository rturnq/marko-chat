import { redirectSignedIn } from "../../server/sign-in";

// The login and signup pages are for guests: someone signed in goes on.
export default Run.ALL((ctx, next) => {
  if (ctx.request.method === "GET" && ctx.session.has("userId")) {
    return redirectSignedIn(ctx);
  }
  return next();
});
