import { shortId } from "./ids";

export const enum UserStatus {
  Offline = 0,
  Active = 1,
  Away = 2,
}

export interface User {
  id: string;
  name: string;
  displayName: string;
  status: UserStatus;
}

export interface Channel {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
}

export interface MessageReaction {
  symbol: string;
  authors: {
    authorId: string;
    authorName: string;
  }[];
}

export interface JoinedMessage extends Message {
  authorName: string;
  reactions: MessageReaction[];
}

export const MESSAGE_PAGE_SIZE = 25;

export interface MessagePage {
  /** Oldest first. */
  messages: JoinedMessage[];
  /** The `before` cursor for the next older page; undefined on the oldest page. */
  older: string | undefined;
}

export type SqlValue = null | number | string;
export type SqlStatement = [sql: string, ...params: SqlValue[]];

/**
 * What `Db` needs from a SQLite connection, shaped like D1: every call is
 * async, parameters are positional (`?` or `?NNN`), and `batch` runs its
 * statements in order in one transaction.
 */
export interface Driver {
  first<Row>(sql: string, ...params: SqlValue[]): Promise<Row | undefined>;
  all<Row>(sql: string, ...params: SqlValue[]): Promise<Row[]>;
  run(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  batch(statements: SqlStatement[]): Promise<{ changes: number }[]>;
}

type MessageRow = Omit<Message, "createdAt" | "editedAt"> & {
  createdAt: number;
  editedAt: number | null;
};

const USER_COLUMNS = "id, name, display_name AS displayName, status";
const CHANNEL_COLUMNS = "id, owner_id AS ownerId, slug, name";
const MESSAGE_COLUMNS =
  "id, channel_id AS channelId, author_id AS authorId, text, created_at AS createdAt, edited_at AS editedAt";

/**
 * The app's queries. Constructing one does no I/O: `connect` runs on the first
 * query, and every query awaits the driver it returns, sync or async.
 */
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
    return db.first<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id);
  }

  async getUserByName(name: string): Promise<User | undefined> {
    const db = await this.#connection();
    return db.first<User>(
      `SELECT ${USER_COLUMNS} FROM users WHERE name = ?`,
      name,
    );
  }

  // Offline is the lowest status, so "online" stays a range on the status index.
  async getOnlineMembers(): Promise<User[]> {
    const db = await this.#connection();
    return db.all<User>(`
      SELECT ${USER_COLUMNS} FROM users
      WHERE status > ${UserStatus.Offline}
      ORDER BY display_name COLLATE NOCASE
    `);
  }

  async getOfflineMembers(): Promise<User[]> {
    const db = await this.#connection();
    return db.all<User>(`
      SELECT ${USER_COLUMNS} FROM users
      WHERE status = ${UserStatus.Offline}
      ORDER BY display_name COLLATE NOCASE
    `);
  }

  async createUser(name: string): Promise<User> {
    const db = await this.#connection();
    const user = await db.first<User>(
      `
      INSERT INTO users (id, name, display_name, status, created_at)
      VALUES (?1, ?2, ?2, ${UserStatus.Active}, ?3)
      ON CONFLICT (name) DO NOTHING
      RETURNING ${USER_COLUMNS}
      `,
      shortId(),
      name,
      Date.now(),
    );
    if (!user) {
      throw new Error(`User with name ${name} already exists`);
    }
    return user;
  }

  async updateUserDisplayName(
    id: string,
    displayName: string,
  ): Promise<User | undefined> {
    const db = await this.#connection();
    return db.first<User>(
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
    return db.first<User>(
      `UPDATE users SET status = ? WHERE id = ? RETURNING ${USER_COLUMNS}`,
      status,
      id,
    );
  }

  async getChannels(): Promise<Channel[]> {
    const db = await this.#connection();
    return db.all<Channel>(
      `SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY created_at`,
    );
  }

  async getDefaultChannel(): Promise<Channel> {
    const db = await this.#connection();
    const channel = await db.first<Channel>(
      `SELECT ${CHANNEL_COLUMNS} FROM channels ORDER BY created_at LIMIT 1`,
    );
    if (!channel) {
      throw new Error("No channels have been created");
    }
    return channel;
  }

  async getChannelBySlug(slug: string): Promise<Channel | undefined> {
    const db = await this.#connection();
    return db.first<Channel>(
      `SELECT ${CHANNEL_COLUMNS} FROM channels WHERE slug = ?`,
      slug,
    );
  }

  async getChannelByMessageId(messageId: string): Promise<Channel | undefined> {
    const db = await this.#connection();
    return db.first<Channel>(
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
    const channel = await db.first<Channel>(
      `
      INSERT INTO channels (id, owner_id, slug, name, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (slug) DO NOTHING
      RETURNING ${CHANNEL_COLUMNS}
      `,
      shortId(),
      ownerId,
      slug,
      name,
      Date.now(),
    );
    if (!channel) {
      throw new Error(`Channel with name ${name} already exists`);
    }
    return channel;
  }

  /**
   * A page of the channel's messages: the latest, or with `before` (a message
   * id, see `MessagePage.older`) the ones just older than that message.
   */
  async getMessages(
    channelSlug: string,
    {
      before,
      limit = MESSAGE_PAGE_SIZE,
    }: { before?: string; limit?: number } = {},
  ): Promise<MessagePage> {
    const db = await this.#connection();
    // Selects one message more than the page to learn whether an older page
    // exists. Each message's reactions are built as JSON by correlated
    // subqueries, so they are index lookups driven by the page's messages
    // (reactions in the order first added, authors in the order they reacted);
    // `json()` keeps the inner arrays from being encoded as strings.
    const rows = await db.all<
      MessageRow & { authorName: string; reactions: string }
    >(
      `
      WITH page AS (
        SELECT m.id, m.channel_id, m.author_id, m.text, m.created_at, m.edited_at
        FROM channels c
        JOIN messages m ON m.channel_id = c.id
        WHERE c.slug = ?1${
          before === undefined
            ? ""
            : `
          AND (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = ?3)`
        }
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?2
      )
      SELECT
        p.id,
        p.channel_id AS channelId,
        p.author_id AS authorId,
        p.text,
        p.created_at AS createdAt,
        p.edited_at AS editedAt,
        u.display_name AS authorName,
        (
          SELECT json_group_array(
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
          WHERE r.message_id = p.id
        ) AS reactions
      FROM page p
      JOIN users u ON u.id = p.author_id
      ORDER BY p.created_at, p.id
      `,
      ...(before === undefined
        ? [channelSlug, limit + 1]
        : [channelSlug, limit + 1, before]),
    );

    const hasOlder = rows.length > limit;
    const messages = (hasOlder ? rows.slice(1) : rows).map(
      ({ reactions, ...row }) => ({
        ...toMessage(row),
        reactions: JSON.parse(reactions) as MessageReaction[],
      }),
    );
    return { messages, older: hasOlder ? messages[0].id : undefined };
  }

  async createMessage(
    channelId: string,
    authorId: string,
    text: string,
  ): Promise<Message> {
    const db = await this.#connection();
    // Selecting from `channels` inserts nothing when the channel does not exist.
    const message = await db.first<MessageRow>(
      `
      INSERT INTO messages (id, channel_id, author_id, text, created_at)
      SELECT ?, id, ?, ?, ? FROM channels WHERE id = ?
      RETURNING ${MESSAGE_COLUMNS}
      `,
      shortId(),
      authorId,
      text,
      Date.now(),
      channelId,
    );
    if (!message) {
      throw new Error(`No channel with id ${channelId}`);
    }
    return toMessage(message);
  }

  async updateMessage(
    messageId: string,
    authorId: string,
    text: string,
  ): Promise<Message> {
    const db = await this.#connection();
    const message = await db.first<MessageRow>(
      `
      UPDATE messages
      SET
        text = ?1,
        edited_at = CASE WHEN text = ?1 THEN edited_at ELSE ?2 END
      WHERE id = ?3 AND author_id = ?4
      RETURNING ${MESSAGE_COLUMNS}
      `,
      text,
      Date.now(),
      messageId,
      authorId,
    );
    if (message) {
      return toMessage(message);
    } else if (
      !(await db.first(`SELECT 1 FROM messages WHERE id = ?`, messageId))
    ) {
      throw new Error(`No message with id ${messageId}`);
    }
    throw new Error(`Cannot edit message for other user`);
  }

  /** Adds or removes the user's reaction; resolves whether they now have it. */
  async toggleReaction(
    messageId: string,
    userId: string,
    symbol: string,
  ): Promise<boolean> {
    const db = await this.#connection();
    const state = await db.first<{ messageExists: number; reacted: number }>(
      `
      SELECT
        EXISTS (SELECT 1 FROM messages WHERE id = ?1) AS messageExists,
        EXISTS (
          SELECT 1 FROM reactions r
          JOIN reaction_users ru ON ru.reaction_id = r.id
          WHERE r.message_id = ?1 AND r.symbol = ?2 AND ru.user_id = ?3
        ) AS reacted
      `,
      messageId,
      symbol,
      userId,
    );
    if (!state?.messageExists) {
      throw new Error(`No message with id ${messageId}`);
    }

    // Both branches are idempotent, so a concurrent toggle cannot corrupt them.
    if (state.reacted) {
      await db.batch([
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
      ]);
      return false;
    }

    const createdAt = Date.now();
    await db.batch([
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
    ]);
    return true;
  }
}

function toMessage<T extends MessageRow>(row: T) {
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    editedAt: row.editedAt === null ? null : new Date(row.editedAt),
  };
}
