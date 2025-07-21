-- Add language column to users table (if not already added in initial migration)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

-- Create index for language column (if not already created)
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);
