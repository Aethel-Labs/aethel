CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    server_id TEXT,
    vote_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    claimed BOOLEAN DEFAULT FALSE,
    credits_awarded INTEGER DEFAULT 10,
    UNIQUE(user_id, server_id, DATE(vote_timestamp))
);

CREATE INDEX idx_votes_user ON votes(user_id, claimed);
CREATE INDEX idx_votes_server ON votes(server_id, claimed) WHERE server_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_credits (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    server_id TEXT,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    last_reset TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_message_credits_user ON message_credits(user_id) WHERE server_id IS NULL;
CREATE UNIQUE INDEX idx_message_credits_server ON message_credits(user_id, server_id) WHERE server_id IS NOT NULL;
