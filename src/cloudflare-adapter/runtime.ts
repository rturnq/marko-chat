// The adapter's runtime side: what a Worker entry imports. Kept apart from
// index.ts, the build side, which a Worker can't bundle (it pulls in Vite,
// the Cloudflare plugin and wrangler). A published adapter would export this
// as its own entry point, such as "@marko/run-adapter-cloudflare/runtime".

/**
 * Marko's HTML runtime batches its stream flushes through one module-level
 * queue and drains it on a `setImmediate` scheduled as the last chunk is
 * pulled. workerd discards a timer once the request that set it has no live
 * I/O context, which for a streamed body is the moment it closes, so the
 * drain never ran and no later render streamed. Holding the context one
 * macrotask past the body's end lets it run.
 */
export function heldOpen(res: Response, ctx: ExecutionContext): Response {
  let done!: () => void;
  const closed = new Promise<void>((resolve) => (done = resolve));
  ctx.waitUntil(
    closed.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
  );
  const body = res.body!.pipeThrough(
    new TransformStream({ flush: () => done(), cancel: () => done() }),
  );
  return new Response(body, res);
}
