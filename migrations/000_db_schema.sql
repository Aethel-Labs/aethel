-- Database schema for Aethel

CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    api_key_encrypted TEXT,
    custom_model TEXT,
    custom_api_url TEXT,
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create index for users table
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);

CREATE TABLE IF NOT EXISTS reminders (
    reminder_id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(user_id),
    user_tag TEXT,
    channel_id TEXT,
    guild_id TEXT,
    message TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);