-- Accounts log in with a password: an encoded argon2id hash, with its salt
-- and settings (src/server/password.ts). Users from before have none, so they
-- can't log in.
ALTER TABLE users ADD COLUMN password_hash TEXT;
