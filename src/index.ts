// The Worker: it runs the marko-run router, handing the routes the D1
// database and the open pages' updates on `ctx.platform`, and the assets
// binding serves client files, fonts and the brand art before it runs. One
// Durable Object holds every open chat page's WebSocket and tells them when
// data changes.
import { DurableObject } from "cloudflare:workers";
import { fetch as routerFetch } from "@marko/run/router";
import type { CloudflarePlatform } from "./cloudflare-adapter";
import { heldOpen } from "./cloudflare-adapter/runtime";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  UPDATES: DurableObjectNamespace<UpdatesObject>;
}

declare module "./cloudflare-adapter" {
  interface CloudflarePlatform {
    db: D1Database;
    updates: Updates;
  }
}

/** The pages open on the chat, each told over a WebSocket when data changes. */
export interface Updates {
  /** Answers a page's WebSocket upgrade request (`GET /ws`). */
  connect(request: Request): Promise<Response>;
  /** Tells every open page that the data has changed. Returns at once. */
  changed(): void;
}

/**
 * The open chat pages' WebSockets, hibernating between messages so an idle
 * page costs nothing. A POST means the data changed: the version goes up and
 * every page is sent it. A page is also sent the current version as it
 * connects, so one that reconnects after missing a change can tell.
 */
export class UpdatesObject extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A page back in the foreground checks its socket with "ping"; the
    // runtime answers without waking the object.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async #version(): Promise<number> {
    return (await this.ctx.storage.get<number>("version")) ?? 0;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ version: await this.#version() }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (request.method === "POST") {
      const version = (await this.#version()) + 1;
      await this.ctx.storage.put("version", version);
      const message = JSON.stringify({ version });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          // Already closing: it's gone from the list on its close.
        }
      }
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }

  override async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ) {
    try {
      socket.close(code, reason);
    } catch {
      // Already closed.
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    // One object for the whole chat: every page, wherever it is, lands on it.
    const updates = env.UPDATES.get(env.UPDATES.idFromName("updates"));
    const res = await routerFetch<CloudflarePlatform>(request, {
      db: env.DB,
      updates: {
        connect: (request) => updates.fetch(request),
        changed() {
          // Sent after the response, so a write never waits on it.
          ctx.waitUntil(
            updates.fetch("https://updates/changed", { method: "POST" }).then(
              () => {},
              (err) => console.error("couldn't send an update", err),
            ),
          );
        },
      },
    });
    if (res) {
      // Preview only (a build-time constant, so a deploy build drops this):
      // local workerd's gzip encoder holds a streamed body to the end, so
      // HTML goes out uncompressed there to keep streaming visible. The edge
      // compresses incrementally.
      if (
        import.meta.env.VITE_PREVIEW &&
        res.headers.get("content-type")?.startsWith("text/html")
      ) {
        res.headers.set("content-encoding", "identity");
      }
      return res.body ? heldOpen(res, ctx) : res;
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
