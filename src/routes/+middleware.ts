import db from "../server/middleware/db";
import remix from "../server/middleware/remix";
import session from "../server/middleware/session";

export default Run.ALL([
  async (_ctx, next) => {
    try {
      return await next();
    } catch (err) {
      console.log(err);
    }
  },
  db,
  ...remix(session),
]);
