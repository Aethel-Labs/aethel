import pgClient from './pgClient';

export async function getUserStrikeInfo(userId: string) {
  const res = await pgClient.query(
    'SELECT strike_count, banned_until FROM user_strikes WHERE user_id = $1',
    [userId]
  );
  return res.rows[0] || null;
}

export async function incrementUserStrike(userId: string) {
  const res = await pgClient.query(`
    INSERT INTO user_strikes (user_id, strike_count, last_strike_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      strike_count = user_strikes.strike_count + 1,
      last_strike_at = NOW()
    RETURNING strike_count, banned_until;
  `, [userId]);
  const { strike_count, banned_until } = res.rows[0];
  if (strike_count >= 5 && (!banned_until || new Date(banned_until) < new Date())) {
    const banUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pgClient.query(
      'UPDATE user_strikes SET banned_until = $2 WHERE user_id = $1',
      [userId, banUntil]
    );
  }
  return { strike_count, banned_until };
}

export async function isUserBanned(userId: string) {
  const res = await pgClient.query(
    'SELECT banned_until FROM user_strikes WHERE user_id = $1',
    [userId]
  );
  if (res.rows.length && res.rows[0].banned_until && new Date(res.rows[0].banned_until) > new Date()) {
    return new Date(res.rows[0].banned_until);
  }
  return null;
}

export async function resetOldStrikes() {
  await pgClient.query(
    `UPDATE user_strikes
     SET strike_count = 0, banned_until = NULL
     WHERE last_strike_at < NOW() - INTERVAL '3 days'`
  );
} 