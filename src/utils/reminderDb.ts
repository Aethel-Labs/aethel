import pool from './pgClient';
import logger from './logger';

interface ReminderData {
  reminder_id: string;
  user_id: string;
  user_tag: string;
  channel_id: string;
  guild_id: string | null;
  message: string;
  expires_at: Date;
  created_at?: Date;
  locale: string;
  metadata?: {
    source: string;
    command_id?: string;
    original_message_id?: string;
    original_channel_id?: string;
    message_url?: string;
  };
}

async function ensureUserRegistered(userId: string, userTag: string, language: string = 'en'): Promise<void> {
  const query = `
    SELECT ensure_user_registered($1, $2, $3)
  `;

  try {
    await pool.query(query, [userId, userTag, language]);
  } catch (error) {
    logger.error('Error ensuring user registration:', error);
    throw error;
  }
}

async function saveReminder(reminderData: ReminderData): Promise<ReminderData> {
  await ensureUserRegistered(reminderData.user_id, reminderData.user_tag, reminderData.locale || 'en');

  const query = `
    INSERT INTO reminders (
      reminder_id, user_id, user_tag, channel_id, guild_id, 
      message, expires_at, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    reminderData.reminder_id,
    reminderData.user_id,
    reminderData.user_tag,
    reminderData.channel_id,
    reminderData.guild_id,
    reminderData.message,
    reminderData.expires_at,
    reminderData.metadata || {},
  ];

  try {
    const result = await pool.query<ReminderData>(query, values);
    return result.rows[0];
  } catch (error) {
    logger.error('Error saving reminder to database:', error);
    throw error;
  }
}

async function completeReminder(reminderId: string) {
  const query = `
    UPDATE reminders
    SET is_completed = TRUE, completed_at = CURRENT_TIMESTAMP
    WHERE reminder_id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [reminderId]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error completing reminder:', error);
    throw error;
  }
}

async function getActiveReminders() {
  const query = `
    SELECT * FROM reminders
    WHERE is_completed = FALSE
    AND expires_at > CURRENT_TIMESTAMP
    ORDER BY expires_at ASC
  `;

  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching active reminders:', error);
    throw error;
  }
}

async function getReminder(reminderId: string) {
  const query = 'SELECT * FROM reminders WHERE reminder_id = $1';

  try {
    const result = await pool.query(query, [reminderId]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching reminder:', error);
    throw error;
  }
}

async function getUserReminders(userId: string) {
  const query = `
    SELECT * FROM reminders
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 50
  `;

  try {
    const result = await pool.query(query, [userId]);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching user reminders:', error);
    throw error;
  }
}

async function cleanupReminders(days = 30) {
  const query = `
    DELETE FROM reminders
    WHERE is_completed = TRUE
    AND completed_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 day')
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [days]);
    return result.rowCount;
  } catch (error) {
    logger.error('Error cleaning up old reminders:', error);
    throw error;
  }
}

export {
  saveReminder,
  completeReminder,
  getActiveReminders,
  getReminder,
  getUserReminders,
  cleanupReminders,
  ensureUserRegistered,
};
