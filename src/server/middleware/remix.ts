import type { Context, NormalizedHandlerFunction } from "@marko/run";
import type { Middleware } from "@remix-run/fetch-router";

interface RemixContext extends Context {
  headers: Headers;
  get(key: object): unknown;
  has(key: object): boolean;
  set(key: object, value: unknown, options?: { property: string }): void;
}

export default function remixShim(
  ...middleware: Middleware<any>[]
): NormalizedHandlerFunction<"ALL", {}>[] {
  return [
    (ctx: RemixContext) => {
      const map = new Map<object, unknown>();
      ctx.headers = ctx.request.headers;
      ctx.get = (key) => map.get(key);
      ctx.has = (key) => map.has(key);
      ctx.set = (key, value, options) => {
        if (!map.has(key)) {
          map.set(key, value);
          if (options) {
            Object.defineProperty(ctx, options.property, {
              configurable: true,
              enumerable: true,
              get: () => map.get(key),
            });
          }
        }
      };
    },
    ...(middleware as any),
  ];
}
