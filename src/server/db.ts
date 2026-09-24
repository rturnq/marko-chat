import { CHARS, shortId } from "./ids";

export const enum UserStatus {
  Offline = 0,
  Active = 1,
  Away = 2,
}

interface UserRow {
  id: string;
  name: string;
  displayName: string;
  status: UserStatus;
}

interface ChannelRow {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
}

interface MessageRow {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  createdAt: number;
  editedAt: number | null;
}

interface MessageJoinedRow extends MessageRow {
  channelSlug: string;
  authorName: string;
  reactions?: string;
}

export interface User extends UserRow {}

export interface Channel extends ChannelRow {}

export interface Message extends MessageRow {
  channelSlug: string;
  authorName: string;
  reactions: Reaction[];
}

export interface Reaction {
  symbol: string;
  authors: {
    authorId: string;
    authorName: string;
  }[];
}

export interface MessagePage {
  messages: Message[];
  older: string | undefined;
  newer: string | undefined;
}

export type SqlValue = null | number | string;
export type SqlStatement = [sql: string, ...params: SqlValue[]];

export interface Driver {
  first<Row>(sql: string, ...params: SqlValue[]): Promise<Row | undefined>;
  all<Row>(sql: string, ...params: SqlValue[]): Promise<Row[]>;
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  batch(...statements: SqlStatement[]): Promise<{ changes: number }[]>;
}

const USER_COLUMNS = "id, name, display_name AS displayName, status";
const CHANNEL_COLUMNS = "id, owner_id AS ownerId, slug, name";
const MESSAGE_COLUMNS =
  "id, channel_id AS channelId, author_id AS authorId, text, created_at AS createdAt, edited_at AS editedAt";

// These complete a message row, which they refer to as `messages`: the table
// itself in a RETURNING clause (where aliases are not visible), or an alias.
const MESSAGE_CHANNEL_SLUG =
  "(SELECT slug FROM channels WHERE id = messages.channel_id) AS channelSlug";
const MESSAGE_AUTHOR_NAME =
  "(SELECT display_name FROM users WHERE id = messages.author_id) AS authorName";
const MESSAGE_REACTIONS = `(
  SELECT json_group_array(
    -- json(): the subquery's result loses SQLite's JSON flag, so without
    -- this authors is embedded as an escaped string instead of an array
    json_object('symbol', r.symbol, 'authors', json((
      SELECT json_group_array(
        json_object('authorId', ru.user_id, 'authorName', ru_user.display_name)
        ORDER BY ru.created_at
      )
      FROM reaction_users ru
      JOIN users ru_user ON ru_user.id = ru.user_id
      WHERE ru.reaction_id = r.id
    )))
    ORDER BY r.created_at, r.id
  )
  FROM reactions r
  WHERE r.message_id = messages.id
) AS reactions`;

export class Db {
  #connect: () => Driver | Promise<Driver>;
  #driver: Driver | Promise<Driver> | undefined;

  constructor(connect: () => Driver | Promise<Driver>) {
    this.#connect = connect;
  }

  #connection() {
    return (this.#driver ??= this.#connect());
  }

  async getUser(id: string): Promise<User | undefined> {
    const db = await this.#connection();
    return db.first<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`,
      id,
    );
  }

  async getUserByName(name: string): Promise<User | undefined> {
    const db = await this.#connection();
    return db.first<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE name = ?`,
      name,
    );
  }

  async getOnlineMembers(): Promise<User[]> {
    const db = await this.#connection();
    return db.all<UserRow>(`
      SELECT ${USER_COLUMNS} FROM users
      WHERE status > ${UserStatus.Offline}
      ORDER BY display_name COLLATE NOCASE
    `);
  }

  async getOfflineMembers(): Promise<User[]> {
    const db = await this.#connection();
    return db.all<UserRow>(`
      SELECT ${USER_COLUMNS} FROM users
      WHERE status = ${UserStatus.Offline}
      ORDER BY display_name COLLATE NOCASE
    `);
  }

  async createUser(name: string): Promise<User> {
    const db = await this.#connection();
    const user = await db.first<UserRow>(
      `
      INSERT INTO users (id, name, display_name, status, created_at)
      VALUES (?1, ?2, ?2, ${UserStatus.Active}, ?3)
      RETURNING ${USER_COLUMNS}
      `,
      shortId(),
      name,
      Date.now(),
    );
    return user!;
  }

  async updateUserDisplayName(
    id: string,
    displayName: string,
  ): Promise<User | undefined> {
    const db = await this.#connection();
    return db.first<UserRow>(
      `UPDATE users SET display_name = ? WHERE id = ? RETURNING ${USER_COLUMNS}`,
      displayName,
      id,
    );
  }

  async updateUserStatus(
    id: string,
    status: UserStatus,
  ): Promise<User | undefined> {
    const db = await this.#connection();
    return db.first<UserRow>(
      `UPDATE users SET status = ? WHERE id = ? RETURNING ${USER_COLUMNS}`,
      status,
      id,
    );
  }

  async getChannels(): Promise<Channel[]> {
    const db = await this.#connection();
    return db.all<ChannelRow>(
      `SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY created_at`,
    );
  }

  async getDefaultChannel(): Promise<Channel | undefined> {
    const db = await this.#connection();
    return await db.first<ChannelRow>(
      `SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY created_at LIMIT 1`,
    );
  }

  async getChannelBySlug(slug: string): Promise<Channel | undefined> {
    const db = await this.#connection();
    return db.first<ChannelRow>(
      `SELECT ${CHANNEL_COLUMNS} FROM channels WHERE slug = ?`,
      slug,
    );
  }

  async getChannelByMessageId(messageId: string): Promise<Channel | undefined> {
    const db = await this.#connection();
    return db.first<ChannelRow>(
      `
      SELECT c.id, c.owner_id AS ownerId, c.slug, c.name
      FROM messages m
      JOIN channels c ON c.id = m.channel_id
      WHERE m.id = ?
      `,
      messageId,
    );
  }

  async createChannel(name: string, ownerId: string): Promise<Channel> {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/, "-")
      .replace(/^-+|-+$/, "");
    const db = await this.#connection();
    // A duplicate slug or missing owner fails a constraint, so RETURNING always
    // yields the row.
    const channel = await db.first<ChannelRow>(
      `
      INSERT INTO channels (id, owner_id, slug, name, created_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING ${CHANNEL_COLUMNS}
      `,
      shortId(),
      ownerId,
      slug,
      name,
      Date.now(),
    );
    return channel!;
  }

  async getMessages(
    channelSlug: string,
    cursor?: string,
    limit: number = 25,
  ): Promise<MessagePage> {
    limit = Math.max(limit, 1);
    // A cursor that does not parse is ignored, and without one this is the
    // latest page.
    const position = parseCursor(cursor);
    const ascending = !!position?.newer;
    const order = ascending ? "ASC" : "DESC";

    const db = await this.#connection();
    const params = [channelSlug, limit + 1];
    if (position) {
      params.push(position.createdAt, position.id);
    }
    const [rows, otherSide] = await Promise.all([
      db.all<MessageJoinedRow>(
        `
        WITH page AS (
          SELECT m.id, m.channel_id, m.author_id, m.text, m.created_at, m.edited_at
          FROM channels c
          JOIN messages m ON m.channel_id = c.id
          WHERE c.slug = ?1${
            position
              ? `
          AND (m.created_at, m.id) ${ascending ? ">" : "<"} (?3, ?4)`
              : ``
          }
          ORDER BY m.created_at ${order}, m.id ${order}
          LIMIT ?2
        )
        -- Every message on the page is in the requested channel.
        SELECT ${MESSAGE_COLUMNS}, ?1 AS channelSlug, ${MESSAGE_AUTHOR_NAME}, ${MESSAGE_REACTIONS}
        FROM page AS messages
        ORDER BY created_at, id
        `,
        ...params,
      ),
      // The page came from the cursor's side, but those messages may have been
      // deleted since, so check that some remain.
      position &&
        db.first<{ found: number }>(
          `
          SELECT EXISTS (
            SELECT 1
            FROM channels c
            JOIN messages m ON m.channel_id = c.id
            WHERE c.slug = ?1 AND (m.created_at, m.id) ${ascending ? "<=" : ">="} (?2, ?3)
          ) AS found
          `,
          channelSlug,
          position.createdAt,
          position.id,
        ),
    ]);

    // The extra row is the one furthest in the paging direction.
    const hasMore = rows.length > limit;
    if (hasMore) {
      if (ascending) {
        rows.pop();
      } else {
        rows.shift();
      }
    }
    rows.forEach(toMessage);
    const hasOtherSide = !!otherSide?.found && rows.length > 0;
    return {
      messages: rows as unknown as Message[],
      older: (ascending ? hasOtherSide : hasMore)
        ? toCursor("b", rows[0])
        : undefined,
      newer: (ascending ? hasMore : hasOtherSide)
        ? toCursor("a", rows.at(-1)!)
        : undefined,
    };
  }

  async createMessage(
    channelId: string,
    authorId: string,
    text: string,
  ): Promise<Message> {
    const db = await this.#connection();
    const row = await db.first<MessageJoinedRow>(
      `
      INSERT INTO messages (id, channel_id, author_id, text, created_at)
      VALUES (?, ?, ?, ?, ?)
      RETURNING ${MESSAGE_COLUMNS}, ${MESSAGE_CHANNEL_SLUG}, ${MESSAGE_AUTHOR_NAME}
      `,
      shortId(),
      channelId,
      authorId,
      text,
      Date.now(),
    );
    return toMessage(row!);
  }

  async updateMessage(
    messageId: string,
    authorId: string,
    text: string,
  ): Promise<Message> {
    const db = await this.#connection();
    const row = await db.first<MessageJoinedRow>(
      `
      UPDATE messages
      SET
        text = ?1,
        edited_at = CASE WHEN text = ?1 THEN edited_at ELSE ?2 END
      WHERE id = ?3 AND author_id = ?4
      RETURNING ${MESSAGE_COLUMNS}, ${MESSAGE_CHANNEL_SLUG}, ${MESSAGE_AUTHOR_NAME}, ${MESSAGE_REACTIONS}
      `,
      text,
      Date.now(),
      messageId,
      authorId,
    );
    if (!row) {
      throw new Error(`Unable to edit message`);
    }
    return toMessage(row);
  }

  async deleteMessage(
    messageId: string,
    authorId: string,
  ): Promise<Message> {
    const db = await this.#connection();
    // Its reactions are gone by the time RETURNING runs (the delete cascades
    // to them first), so the deleted message comes back without them.
    const row = await db.first<MessageJoinedRow>(
      `
      DELETE FROM messages
      WHERE id = ? AND author_id = ?
      RETURNING ${MESSAGE_COLUMNS}, ${MESSAGE_CHANNEL_SLUG}, ${MESSAGE_AUTHOR_NAME}
      `,
      messageId,
      authorId,
    );
    if (!row) {
      throw new Error(`Unable to delete message`);
    }
    return toMessage(row);
  }

  async addReaction(
    messageId: string,
    userId: string,
    symbol: string,
  ): Promise<void> {
    const db = await this.#connection();
    const createdAt = Date.now();
    await db.batch(
      [
        `
        INSERT INTO reactions (id, message_id, symbol, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (message_id, symbol) DO NOTHING
        `,
        shortId(),
        messageId,
        symbol,
        createdAt,
      ],
      [
        `
        INSERT INTO reaction_users (reaction_id, user_id, created_at)
        SELECT id, ?3, ?4 FROM reactions WHERE message_id = ?1 AND symbol = ?2
        ON CONFLICT DO NOTHING
        `,
        messageId,
        symbol,
        userId,
        createdAt,
      ],
    );
  }

  async removeReaction(
    messageId: string,
    userId: string,
    symbol: string,
  ): Promise<void> {
    const db = await this.#connection();
    await db.batch(
      [
        `
        DELETE FROM reaction_users
        WHERE user_id = ?3
          AND reaction_id = (
            SELECT id FROM reactions WHERE message_id = ?1 AND symbol = ?2
          )
        `,
        messageId,
        symbol,
        userId,
      ],
      [
        `
        DELETE FROM reactions
        WHERE message_id = ? AND symbol = ?
          AND NOT EXISTS (SELECT 1 FROM reaction_users WHERE reaction_id = reactions.id)
        `,
        messageId,
        symbol,
      ],
    );
  }
}

// A cursor is a direction ("b" for older than, "a" for newer than) and a
// message's position: its createdAt as 7 base62 digits, then its id. Carrying
// the position rather than just the id keeps it working after that message is
// deleted.
function toCursor(direction: "b" | "a", { createdAt, id }: MessageRow) {
  return direction + encodeTime(createdAt) + id;
}

function parseCursor(cursor: string | undefined) {
  const match = cursor && /^([ab])([0-9A-Za-z]{7})(.+)$/.exec(cursor);
  return match
    ? { newer: match[1] === "a", createdAt: decodeTime(match[2]), id: match[3] }
    : undefined;
}

// 7 base62 digits hold 62^7 ms, about 111 years, so a timestamp is encoded
// modulo that and decoded as the moment nearest now with those digits. With
// messages kept only a few years that is always the right one, and the format
// never runs out.
const TIME_PERIOD = 62 ** 7;

function encodeTime(ms: number) {
  let n = ms % TIME_PERIOD;
  let digits = "";
  for (let i = 0; i < 7; i++) {
    digits = CHARS[n % 62] + digits;
    n = Math.floor(n / 62);
  }
  return digits;
}

function decodeTime(digits: string) {
  let n = 0;
  for (const digit of digits) {
    n = n * 62 + CHARS.indexOf(digit);
  }
  const now = Date.now();
  let offset = (((now - n) % TIME_PERIOD) + TIME_PERIOD) % TIME_PERIOD;
  if (offset > TIME_PERIOD / 2) {
    offset -= TIME_PERIOD;
  }
  return now - offset;
}

function toMessage(row: MessageJoinedRow): Message {
  const message = row as unknown as Message;
  message.reactions = row.reactions ? JSON.parse(row.reactions) : [];
  return message;
}
