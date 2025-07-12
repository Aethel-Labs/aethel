-- Function to ensure user is registered in the database
CREATE OR REPLACE FUNCTION ensure_user_registered(
    p_user_id TEXT,
    p_user_tag TEXT DEFAULT NULL,
    p_language VARCHAR(10) DEFAULT 'en'
) RETURNS VOID AS $$
BEGIN
    -- Insert user if they don't exist, otherwise do nothing
    INSERT INTO users (user_id, language, created_at)
    VALUES (p_user_id, p_language, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO NOTHING;
    
END;
$$ LANGUAGE plpgsql; 