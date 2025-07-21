-- Create reminders table (only if not exists from initial migration)
CREATE TABLE IF NOT EXISTS reminders (
    reminder_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_tag TEXT NOT NULL,
    channel_id TEXT,
    guild_id TEXT,
    message TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_expires_at ON reminders(expires_at) WHERE is_completed = FALSE;
