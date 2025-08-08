import pgClient from './pgClient';
import logger from './logger';

export interface StrikeInfo {
  strike_count: number;
  banned_until: Date | null;
}

export class StrikeError extends Error {
  constructor(
    message: string,
    public readonly userId?: string,
  ) {
    super(message);
    this.name = 'StrikeError';
  }
}

export async function getUserStrikeInfo(userId: string): Promise<StrikeInfo | null> {
  if (!userId || typeof userId !== 'string') {
    throw new StrikeError('Invalid user ID provided');
  }

  try {
    const res = await pgClient.query(
      'SELECT strike_count, banned_until FROM user_strikes WHERE user_id = $1',
      [userId],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return {
      strike_count: res.rows[0].strike_count,
      banned_until: res.rows[0].banned_until ? new Date(res.rows[0].banned_until) : null,
    };
  } catch (error) {
    logger.error('Failed to get user strike info', { userId, error });
    throw new StrikeError('Failed to retrieve strike information', userId);
  }
}

export async function incrementUserStrike(userId: string): Promise<StrikeInfo> {
  if (!userId || typeof userId !== 'string') {
    throw new StrikeError('Invalid user ID provided');
  }

  try {
    const res = await pgClient.query(
      `
      INSERT INTO user_strikes (user_id, strike_count, last_strike_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        strike_count = user_strikes.strike_count + 1,
        last_strike_at = NOW()
      RETURNING strike_count, banned_until;
    `,
      [userId],
    );

    if (res.rows.length === 0) {
      throw new StrikeError('Failed to increment strike - no rows returned', userId);
    }

    const { strike_count, banned_until } = res.rows[0];

    if (strike_count >= 5 && (!banned_until || new Date(banned_until) < new Date())) {
      try {
        const banUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pgClient.query('UPDATE user_strikes SET banned_until = $2 WHERE user_id = $1', [
          userId,
          banUntil,
        ]);

        logger.warn('User auto-banned due to strike limit', {
          userId,
          strikeCount: strike_count,
          banUntil: banUntil.toISOString(),
        });

        return {
          strike_count,
          banned_until: banUntil,
        };
      } catch (banError) {
        logger.error('Failed to apply auto-ban', { userId, error: banError });
        return {
          strike_count,
          banned_until: banned_until ? new Date(banned_until) : null,
        };
      }
    }

    logger.info('User strike incremented', { userId, strikeCount: strike_count });

    return {
      strike_count,
      banned_until: banned_until ? new Date(banned_until) : null,
    };
  } catch (error) {
    logger.error('Failed to increment user strike', { userId, error });
    throw new StrikeError('Failed to increment strike count', userId);
  }
}

export async function isUserBanned(userId: string): Promise<Date | null> {
  if (!userId || typeof userId !== 'string') {
    throw new StrikeError('Invalid user ID provided');
  }

  try {
    const res = await pgClient.query('SELECT banned_until FROM user_strikes WHERE user_id = $1', [
      userId,
    ]);

    if (res.rows.length === 0 || !res.rows[0].banned_until) {
      return null;
    }

    const banUntil = new Date(res.rows[0].banned_until);

    if (banUntil > new Date()) {
      return banUntil;
    }

    return null;
  } catch (error) {
    logger.error('Failed to check user ban status', { userId, error });
    throw new StrikeError('Failed to check ban status', userId);
  }
}

export async function resetOldStrikes(): Promise<number> {
  try {
    const res = await pgClient.query(
      `UPDATE user_strikes
       SET strike_count = 0, banned_until = NULL
       WHERE last_strike_at < NOW() - INTERVAL '3 days'
       RETURNING user_id`,
    );

    const resetCount = res.rows.length;

    if (resetCount > 0) {
      logger.info('Reset old strikes', { resetCount });
    }

    return resetCount;
  } catch (error) {
    logger.error('Failed to reset old strikes', { error });
    throw new StrikeError('Failed to reset old strikes');
  }
}

export async function clearUserStrikes(userId: string): Promise<boolean> {
  if (!userId || typeof userId !== 'string') {
    throw new StrikeError('Invalid user ID provided');
  }

  try {
    const res = await pgClient.query(
      'UPDATE user_strikes SET strike_count = 0, banned_until = NULL WHERE user_id = $1',
      [userId],
    );

    logger.info('Cleared user strikes', { userId });
    return (res.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Failed to clear user strikes', { userId, error });
    throw new StrikeError('Failed to clear strikes', userId);
  }
}
