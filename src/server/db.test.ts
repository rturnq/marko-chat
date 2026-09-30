import { beforeEach, describe, expect, it } from "vitest";
import { Db, type Driver, type MessagePage } from "./db";
import { createDriver } from "./sqlite";

// Pages of 5, over #test's messages m01 (oldest) to m20 (newest).
const limit = 5;

let driver: Driver;
let db: Db;

beforeEach(async () => {
  driver = createDriver(":memory:");
  db = new Db(() => driver);
  const owner = "(SELECT id FROM users WHERE name = '_system')";
  // Cursors encode times relative to now, so the messages are recent.
  const start = Date.now() - 60_000;
  await driver.run(
    `INSERT INTO channels (id, owner_id, slug, name, created_at)
     VALUES ('c1', ${owner}, 'test', 'Test', 0)`,
  );
  for (let i = 1; i <= 20; i++) {
    await driver.run(
      `INSERT INTO messages (id, channel_id, author_id, text, created_at)
       VALUES (?, 'c1', ${owner}, ?, ?)`,
      id(i),
      `Message ${i}`,
      start + i * 1000,
    );
  }
});

function id(i: number) {
  return `m${String(i).padStart(2, "0")}`;
}

function range(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => id(from + i));
}

function ids(page: MessagePage) {
  return page.messages.map((message) => message.id);
}

function page(options: { cursor?: string; focus?: string } = {}) {
  return db.getMessages("test", { ...options, limit });
}

describe("getMessages", () => {
  it("returns the latest page", async () => {
    const latest = await page();
    expect(ids(latest)).toEqual(range(16, 20));
    expect(latest.older).toBeDefined();
    expect(latest.newer).toBeUndefined();
  });

  it("pages back and forward with cursors", async () => {
    const latest = await page();
    const older = await page({ cursor: latest.older });
    expect(ids(older)).toEqual(range(11, 15));
    const back = await page({ cursor: older.newer });
    expect(ids(back)).toEqual(range(16, 20));
  });

  describe("with a focus", () => {
    it("starts the page at the focus, with newer messages after it", async () => {
      const focused = await page({ focus: id(8) });
      expect(ids(focused)).toEqual(range(8, 12));
      expect(focused.older).toBeDefined();
      expect(focused.newer).toBeDefined();
    });

    it("fills the page with older messages near the newest", async () => {
      const focused = await page({ focus: id(18) });
      expect(ids(focused)).toEqual(range(16, 20));
      expect(focused.older).toBeDefined();
      expect(focused.newer).toBeUndefined();
    });

    it("has no older cursor at the oldest message", async () => {
      const focused = await page({ focus: id(1) });
      expect(ids(focused)).toEqual(range(1, 5));
      expect(focused.older).toBeUndefined();
      expect(focused.newer).toBeDefined();
    });

    it("pages on from the focused page", async () => {
      const focused = await page({ focus: id(8) });
      expect(ids(await page({ cursor: focused.older }))).toEqual(range(3, 7));
      expect(ids(await page({ cursor: focused.newer }))).toEqual(range(13, 17));
    });

    it("keeps the cursor's page when the focus is on it", async () => {
      const older = await page({ cursor: (await page()).older });
      expect(ids(await page({ cursor: older.older, focus: id(8) }))).toEqual(
        range(6, 10),
      );
      expect(ids(await page({ cursor: older.newer, focus: id(18) }))).toEqual(
        range(16, 20),
      );
    });

    it("replaces the cursor's page when the focus isn't on it", async () => {
      const latest = await page();
      const focused = await page({ cursor: latest.older, focus: id(3) });
      expect(ids(focused)).toEqual(range(3, 7));
    });

    it("keeps the latest page when the focus is on it", async () => {
      expect(ids(await page({ focus: id(17) }))).toEqual(range(16, 20));
    });

    it("ignores a deleted focus", async () => {
      await driver.run("DELETE FROM messages WHERE id = ?", id(8));
      expect(ids(await page({ focus: id(8) }))).toEqual(range(16, 20));
      const latest = await page();
      expect(ids(await page({ cursor: latest.older, focus: id(8) }))).toEqual(
        range(11, 15),
      );
    });

    it("orders messages from the same moment by id", async () => {
      // m21 and m22 share m20's time; ties sort by id.
      const time = await driver.first<{ t: number }>(
        "SELECT created_at AS t FROM messages WHERE id = ?",
        id(20),
      );
      for (const extra of [21, 22]) {
        await driver.run(
          `INSERT INTO messages (id, channel_id, author_id, text, created_at)
           SELECT ?, 'c1', author_id, 'Same time', created_at FROM messages WHERE id = ?`,
          id(extra),
          id(20),
        );
      }
      expect(time).toBeDefined();
      expect(ids(await page({ focus: id(21) }))).toEqual(range(18, 22));
      const latest = await page();
      expect(ids(latest)).toEqual(range(18, 22));
      expect(ids(await page({ cursor: latest.older }))).toEqual(range(13, 17));
    });

    it("ignores a focus in another channel", async () => {
      const welcome = await driver.first<{ id: string }>(
        "SELECT id FROM messages WHERE text = 'Welcome!'",
      );
      expect(ids(await page({ focus: welcome!.id }))).toEqual(range(16, 20));
    });
  });
});
