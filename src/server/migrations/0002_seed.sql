-- The system user, the default channel, and its welcome message.
INSERT INTO users (id, name, display_name, status, created_at)
VALUES (lower(hex(randomblob(5))), '_system', 'Admin', 1, unixepoch() * 1000);

INSERT INTO channels (id, owner_id, slug, name, created_at)
SELECT lower(hex(randomblob(5))), id, 'general', 'General', created_at
FROM users WHERE name = '_system';

INSERT INTO messages (id, channel_id, author_id, text, created_at)
SELECT lower(hex(randomblob(5))), id, owner_id, 'Welcome!', created_at
FROM channels WHERE slug = 'general';
