// The chat page's WebSocket: handed to the host's updates, which hold every
// open page's socket and tell them all when data changes.
export const GET = Run.GET((ctx) => {
  if (ctx.request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket upgrade", { status: 426 });
  }
  return ctx.platform.updates.connect(ctx.request);
});
