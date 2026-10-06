import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, type MessagePage } from "../db";
import { createTestDatabase } from "./database";

// Pages of 5, over #test's messages m01 (oldest) to m20 (newest).
const limit = 5;

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let db: Db;

beforeEach(async () => {
  database = await createTestDatabase();
  db = new Db(database.d1);
  const owner = "(SELECT id FROM users WHERE name = '_system')";
  // Cursors encode times relative to now, so the messages are recent.
  const start = Date.now() - 60_000;
  await database.run(
    `INSERT INTO channels (id, owner_id, slug, name, created_at)
     VALUES ('c1', ${owner}, 'test', 'Test', 0)`,
  );
  for (let i = 1; i <= 20; i++) {
    await database.run(
      `INSERT INTO messages (id, channel_id, author_id, text, created_at)
       VALUES (?, 'c1', ${owner}, ?, ?)`,
      id(i),
      `Message ${i}`,
      start + i * 1000,
    );
  }
});

afterEach(() => database.dispose());

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
      await database.run("DELETE FROM messages WHERE id = ?", id(8));
      expect(ids(await page({ focus: id(8) }))).toEqual(range(16, 20));
      const latest = await page();
      expect(ids(await page({ cursor: latest.older, focus: id(8) }))).toEqual(
        range(11, 15),
      );
    });

    it("orders messages from the same moment by id", async () => {
      // m21 and m22 share m20's time; ties sort by id.
      const time = await database.first<{ t: number }>(
        "SELECT created_at AS t FROM messages WHERE id = ?",
        id(20),
      );
      for (const extra of [21, 22]) {
        await database.run(
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
      const welcome = await database.first<{ id: string }>(
        "SELECT id FROM messages WHERE text = 'Welcome!'",
      );
      expect(ids(await page({ focus: welcome!.id }))).toEqual(range(16, 20));
    });
  });
});

describe("users", () => {
  it("creates a user with a password hash", async () => {
    const user = await db.createUser("ada", "scrypt$hash");
    expect(user).toMatchObject({ name: "ada", displayName: "ada" });
    expect(await db.getLogin("ada")).toEqual({
      id: user!.id,
      passwordHash: "scrypt$hash",
    });
  });

  it("won't create a user whose name is taken", async () => {
    await db.createUser("ada", "first");
    expect(await db.createUser("ada", "second")).toBeUndefined();
    expect((await db.getLogin("ada"))!.passwordHash).toBe("first");
  });

  it("counts a name as taken if it's any user's name or display name, in any case", async () => {
    await db.createUser("ada", "hash");
    expect(await db.isNameTaken("ada")).toBe(true);
    expect(await db.isNameTaken("ADA")).toBe(true);
    // The seeded system user logs in as _system and shows as Admin.
    expect(await db.isNameTaken("admin")).toBe(true);
    expect(await db.isNameTaken("grace")).toBe(false);
  });

  it("has no login for an unknown name", async () => {
    expect(await db.getLogin("nobody")).toBeUndefined();
  });
});

describe("changes", () => {
  it("reports writes that changed something, and not reads or no-ops", async () => {
    let changes = 0;
    const tracked = new Db(database.d1, () => changes++);
    await tracked.getChannels();
    await tracked.getMessages("test");
    expect(changes).toBe(0);

    const user = await tracked.createUser("ada", "hash");
    expect(changes).toBe(1);
    await tracked.createUser("ada", "taken");
    expect(changes).toBe(1);

    await tracked.createMessage("c1", user!.id, "Hello");
    expect(changes).toBe(2);

    await tracked.addReaction("m01", user!.id, "👍");
    expect(changes).toBe(3);
    await tracked.addReaction("m01", user!.id, "👍");
    expect(changes).toBe(3);
    await tracked.removeReaction("m01", user!.id, "👍");
    expect(changes).toBe(4);
    await tracked.removeReaction("m01", user!.id, "👍");
    expect(changes).toBe(4);
  });
});
