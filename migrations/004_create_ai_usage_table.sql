-- Create ai_usage table for tracking AI command usage
CREATE TABLE IF NOT EXISTS ai_usage (
    user_id TEXT NOT NULL,
    usage_date DATE NOT NULL,
    count INTEGER DEFAULT 1,
    PRIMARY KEY (user_id, usage_date),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, usage_date); 