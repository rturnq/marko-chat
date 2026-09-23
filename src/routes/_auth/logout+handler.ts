export const POST = Run.POST((ctx) => {
  ctx.session.destroy();
  return ctx.redirect(Run.href("/"));
});
