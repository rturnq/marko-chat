-- Pages walk a channel's messages by (created_at, id), with id breaking ties.
DROP INDEX messages_channel_id_created_at;

CREATE INDEX messages_channel_id_created_at_id ON messages (channel_id, created_at, id);
