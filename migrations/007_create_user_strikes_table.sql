CREATE TABLE IF NOT EXISTS user_strikes (
    user_id VARCHAR(64) PRIMARY KEY,
    strike_count INTEGER NOT NULL DEFAULT 0,
    banned_until TIMESTAMPTZ,
    last_strike_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
); 