CREATE TYPE social_platform AS ENUM ('bluesky', 'fediverse');

CREATE TABLE IF NOT EXISTS server_social_subscriptions (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    platform social_platform NOT NULL,
    account_handle TEXT NOT NULL,
    last_post_uri TEXT,
    last_post_timestamp TIMESTAMPTZ,
    channel_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, platform, account_handle)
);

CREATE INDEX IF NOT EXISTS idx_server_social_subscriptions_guild ON server_social_subscriptions(guild_id);
CREATE INDEX IF NOT EXISTS idx_server_social_subscriptions_platform ON server_social_subscriptions(platform);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_server_social_subscriptions_updated_at
BEFORE UPDATE ON server_social_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
