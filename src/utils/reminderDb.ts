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

class DatabaseError extends Error {
  public readonly isDatabaseError = true;
  public readonly isUserFriendly: boolean;
  public readonly userMessage: string;

  constructor(message: string, userMessage?: string, isUserFriendly = false) {
    super(message);
    this.name = 'DatabaseError';
    this.userMessage = userMessage || 'A database error occurred. Please try again later.';
    this.isUserFriendly = isUserFriendly;
  }
}

function createDatabaseError(error: unknown, operation: string): DatabaseError {
  const errorCode = (error as { code?: string }).code;
  const errorMessage = (error as { message?: string }).message || 'Unknown database error';

  logger.error(`Database error during ${operation}:`, error);

  switch (errorCode) {
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
      return new DatabaseError(
        errorMessage,
        'Unable to connect to the database. Please try again later.',
        true
      );
    case '42703':
      return new DatabaseError(
        errorMessage,
        'Database schema error. Please contact support.',
        true
      );
    case '23505':
      return new DatabaseError(errorMessage, 'This reminder already exists.', true);
    case '23502':
      return new DatabaseError(
        errorMessage,
        'Missing required information. Please try again.',
        true
      );
    case '23503':
      return new DatabaseError(errorMessage, 'Invalid reference. Please try again.', true);
    default:
      return new DatabaseError(
        errorMessage,
        'A database error occurred. Please try again later.',
        false
      );
  }
}

async function ensureUserRegistered(
  userId: string,
  userTag: string,
  language: string = 'en'
): Promise<void> {
  const query = `
    SELECT ensure_user_registered($1, $2, $3)
  `;

  try {
    await pool.query(query, [userId, userTag, language]);
  } catch (error) {
    throw createDatabaseError(error, 'user registration');
  }
}

async function saveReminder(reminderData: ReminderData): Promise<ReminderData> {
  await ensureUserRegistered(
    reminderData.user_id,
    reminderData.user_tag,
    reminderData.locale || 'en'
  );

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
    throw createDatabaseError(error, 'saving reminder');
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
    throw createDatabaseError(error, 'completing reminder');
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
    throw createDatabaseError(error, 'fetching active reminders');
  }
}

async function getReminder(reminderId: string) {
  const query = 'SELECT * FROM reminders WHERE reminder_id = $1';

  try {
    const result = await pool.query(query, [reminderId]);
    return result.rows[0] || null;
  } catch (error) {
    throw createDatabaseError(error, 'fetching reminder');
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
    throw createDatabaseError(error, 'fetching user reminders');
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
    throw createDatabaseError(error, 'cleaning up reminders');
  }
}

async function clearCompletedReminders(userId: string) {
  const query = `
    DELETE FROM reminders
    WHERE user_id = $1
    AND is_completed = TRUE
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [userId]);
    return result.rowCount;
  } catch (error) {
    throw createDatabaseError(error, 'clearing completed reminders');
  }
}

export {
  saveReminder,
  completeReminder,
  getActiveReminders,
  getReminder,
  getUserReminders,
  cleanupReminders,
  clearCompletedReminders,
  ensureUserRegistered,
  DatabaseError,
};
