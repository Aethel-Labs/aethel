CREATE TABLE IF NOT EXISTS server_ai_usage (
    server_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    count INTEGER DEFAULT 1,
    PRIMARY KEY (server_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_server_ai_usage_server_date ON server_ai_usage(server_id, usage_date);
