import pool from './pgClient';
import { Client, GatewayIntentBits } from 'discord.js';
import { checkVoteStatus } from './topgg';

const VOTE_CREDITS = 10;
const VOTE_COOLDOWN_HOURS = 12;

export interface VoteResult {
  success: boolean;
  creditsAwarded: number;
  nextVoteAvailable: Date;
}

export interface CreditsInfo {
  remaining: number;
  lastReset: Date;
}

export async function hasVotedToday(
  userId: string,
  serverId?: string,
): Promise<{ hasVoted: boolean; nextVote: Date }> {
  try {
    const localResult = await pool.query<{ vote_timestamp: Date }>(
      `SELECT vote_timestamp FROM votes 
       WHERE user_id = $1 
       AND (server_id = $2 OR ($2 IS NULL AND server_id IS NULL))
       ORDER BY vote_timestamp DESC
       LIMIT 1`,
      [userId, serverId],
    );

    if (localResult.rows.length > 0) {
      const lastVote = new Date(localResult.rows[0].vote_timestamp);
      const nextVote = new Date(lastVote.getTime() + VOTE_COOLDOWN_HOURS * 60 * 60 * 1000);

      if (Date.now() < nextVote.getTime()) {
        return { hasVoted: true, nextVote };
      }
    }

    if (process.env.TOPGG_TOKEN) {
      const voteStatus = await checkVoteStatus(userId);
      if (voteStatus.hasVoted) {
        await recordVoteInDatabase(userId, serverId);
        return { hasVoted: true, nextVote: voteStatus.nextVote };
      }
      return { hasVoted: false, nextVote: voteStatus.nextVote };
    }

    return { hasVoted: false, nextVote: new Date() };
  } catch (error) {
    console.error('Error checking vote status:', error);
    const result = await pool.query(
      `SELECT 1 FROM votes 
       WHERE user_id = $1 
       AND (server_id = $2 OR ($2 IS NULL AND server_id IS NULL))
       AND vote_timestamp > NOW() - INTERVAL '${VOTE_COOLDOWN_HOURS} hours'`,
      [userId, serverId],
    );
    return {
      hasVoted: result.rows.length > 0,
      nextVote: new Date(Date.now() + VOTE_COOLDOWN_HOURS * 60 * 60 * 1000),
    };
  }
}

async function recordVoteInDatabase(userId: string, serverId?: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO votes (user_id, server_id, credits_awarded) 
       VALUES ($1, $2, $3)`,
      [userId, serverId || null, VOTE_CREDITS],
    );

    const query = serverId
      ? `INSERT INTO message_credits (user_id, server_id, credits_remaining, last_reset)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, server_id) WHERE server_id IS NOT NULL
         DO UPDATE SET 
           credits_remaining = message_credits.credits_remaining + $3,
           last_reset = NOW()
         RETURNING credits_remaining`
      : `INSERT INTO message_credits (user_id, credits_remaining, last_reset)
         VALUES ($1, $3, NOW())
         ON CONFLICT (user_id) WHERE server_id IS NULL
         DO UPDATE SET 
           credits_remaining = message_credits.credits_remaining + $3,
           last_reset = NOW()
         RETURNING credits_remaining`;

    await client.query(query, [userId, serverId, VOTE_CREDITS].filter(Boolean));

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function recordVote(
  userId: string,
  serverId?: string,
): Promise<{ success: boolean; creditsAwarded: number; nextVoteAvailable: Date }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingVote = await client.query(
      `SELECT vote_timestamp FROM votes 
       WHERE user_id = $1 
       AND (server_id = $2 OR ($2 IS NULL AND server_id IS NULL))
       ORDER BY vote_timestamp DESC
       LIMIT 1`,
      [userId, serverId || null],
    );

    if (existingVote.rows.length > 0) {
      const lastVoteTime = new Date(existingVote.rows[0].vote_timestamp).getTime();
      const cooldownEnd = lastVoteTime + VOTE_COOLDOWN_HOURS * 60 * 60 * 1000;

      if (Date.now() < cooldownEnd) {
        return {
          success: false,
          creditsAwarded: 0,
          nextVoteAvailable: new Date(cooldownEnd),
        };
      }
    }

    const voteStatus = await checkVoteStatus(userId);
    if (!voteStatus.hasVoted) {
      return {
        success: false,
        creditsAwarded: 0,
        nextVoteAvailable: voteStatus.nextVote,
      };
    }

    await client.query(
      `INSERT INTO votes (user_id, server_id, credits_awarded) 
       VALUES ($1, $2, $3)`,
      [userId, serverId || null, VOTE_CREDITS],
    );

    await client.query(
      `INSERT INTO message_credits (user_id, credits_remaining, last_reset)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) WHERE server_id IS NULL
         DO UPDATE SET 
           credits_remaining = message_credits.credits_remaining + $2,
           last_reset = NOW()
         RETURNING credits_remaining`,
      [userId, VOTE_CREDITS],
    );

    const clientBot = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    try {
      await clientBot.login(process.env.TOKEN);
      const user = await clientBot.users.fetch(userId);

      if (user) {
        const guilds = await clientBot.guilds.fetch();
        await Promise.all(
          guilds.map(async (guild) => {
            try {
              const fullGuild = await guild.fetch();
              const member = await fullGuild.members.fetch(userId).catch(() => null);

              if (member) {
                await client.query(
                  `INSERT INTO message_credits (user_id, server_id, credits_remaining, last_reset)
                   VALUES ($1, $2, $3, NOW())
                   ON CONFLICT (user_id, server_id) WHERE server_id IS NOT NULL
                   DO UPDATE SET 
                     credits_remaining = message_credits.credits_remaining + $3,
                     last_reset = NOW()
                   RETURNING credits_remaining`,
                  [userId, guild.id, VOTE_CREDITS],
                );
              }
            } catch (error) {
              console.error(`Error processing guild ${guild.id}:`, error);
            }
          }),
        );
      }
    } catch (error) {
      console.error('Error in vote processing:', error);
    } finally {
      clientBot.destroy().catch(console.error);
    }

    await client.query('COMMIT');

    return {
      success: true,
      creditsAwarded: serverId ? VOTE_CREDITS * 2 : VOTE_CREDITS,
      nextVoteAvailable: voteStatus.nextVote,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error recording vote:', error);
    throw new Error('Failed to record your vote. Please try again later.');
  } finally {
    client.release();
  }
}

export async function getRemainingCredits(userId: string, serverId?: string): Promise<CreditsInfo> {
  try {
    const query = serverId
      ? 'SELECT credits_remaining as "creditsRemaining", last_reset as "lastReset" FROM message_credits WHERE user_id = $1 AND server_id = $2'
      : 'SELECT credits_remaining as "creditsRemaining", last_reset as "lastReset" FROM message_credits WHERE user_id = $1 AND server_id IS NULL';

    const result = await pool.query(query, [userId, serverId].filter(Boolean));

    if (result.rows.length === 0) {
      return {
        remaining: 0,
        lastReset: new Date(),
      };
    }

    return {
      remaining: result.rows[0].creditsRemaining,
      lastReset: result.rows[0].lastReset,
    };
  } catch (error) {
    console.error('Error getting remaining credits:', error);
    throw new Error('Failed to get remaining credits');
  }
}

export async function canUseAIFeature(
  userId: string,
  serverId?: string,
): Promise<{ canUse: boolean; remainingCredits: number }> {
  try {
    const credits = await getRemainingCredits(userId, serverId);
    if (credits.remaining > 0) {
      const updateQuery = serverId
        ? 'UPDATE message_credits SET credits_remaining = credits_remaining - 1 WHERE user_id = $1 AND server_id = $2 RETURNING credits_remaining'
        : 'UPDATE message_credits SET credits_remaining = credits_remaining - 1 WHERE user_id = $1 AND server_id IS NULL RETURNING credits_remaining';

      const result = await pool.query(updateQuery, [userId, serverId].filter(Boolean));

      return {
        canUse: true,
        remainingCredits: result.rows[0]?.credits_remaining || 0,
      };
    }

    return {
      canUse: false,
      remainingCredits: 0,
    };
  } catch (error) {
    console.error('Error checking AI feature usage:', error);
    throw new Error('Failed to check AI feature usage');
  }
}
