CREATE INDEX IF NOT EXISTS idx_todos_user_done ON todos(user_id, done);
CREATE INDEX IF NOT EXISTS idx_todos_created ON todos(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(is_completed, expires_at) 
    WHERE is_completed = FALSE;

CREATE INDEX IF NOT EXISTS idx_votes_timestamp ON votes(vote_timestamp);

CREATE INDEX IF NOT EXISTS idx_message_credits_reset ON message_credits(last_reset);

CREATE INDEX IF NOT EXISTS idx_votes_unclaimed ON votes(user_id) 
    WHERE claimed = FALSE;

CREATE INDEX IF NOT EXISTS idx_ai_usage_date_brin ON ai_usage USING brin(usage_date);
CREATE INDEX IF NOT EXISTS idx_server_ai_usage_date_brin ON server_ai_usage USING brin(usage_date);
