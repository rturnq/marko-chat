-- The schema and its seed: the system user, the default channel, and its
-- welcome message. Squashed from the first four migrations under this one's
-- name, so a database that ran them counts this as applied. Add changes as
-- new files.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status IN (0, 1, 2)),
  created_at INTEGER NOT NULL,
  -- An encoded scrypt hash, with its salt and settings
  -- (src/server/password.ts). Users from before passwords have none, so they
  -- can't log in.
  password_hash TEXT
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

-- Pages walk a channel's messages by (created_at, id), with id breaking ties.
CREATE INDEX messages_channel_id_created_at_id ON messages (channel_id, created_at, id);

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

INSERT INTO users (id, name, display_name, status, created_at)
VALUES (lower(hex(randomblob(5))), '_system', 'Admin', 1, unixepoch() * 1000);

INSERT INTO channels (id, owner_id, slug, name, created_at)
SELECT lower(hex(randomblob(5))), id, 'general', 'General', created_at
FROM users WHERE name = '_system';

INSERT INTO messages (id, channel_id, author_id, text, created_at)
SELECT lower(hex(randomblob(5))), id, owner_id, 'Welcome!', created_at
FROM channels WHERE slug = 'general';
