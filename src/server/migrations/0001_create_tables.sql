CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status IN (0, 1, 2)),
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX users_status_display_name ON users (status, display_name COLLATE NOCASE);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users (id),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users (id),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
) STRICT;

CREATE INDEX messages_channel_id_created_at ON messages (channel_id, created_at);

CREATE TABLE reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (message_id, symbol)
) STRICT;

CREATE TABLE reaction_users (
  reaction_id TEXT NOT NULL REFERENCES reactions (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (reaction_id, user_id)
) STRICT, WITHOUT ROWID;
