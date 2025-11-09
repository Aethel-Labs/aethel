import pool from './pgClient';
import { Client, GatewayIntentBits } from 'discord.js';
import { checkVoteStatus } from './topgg';
import logger from './logger';

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

async function _hasVotedToday(
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
                logger.debug(
                  `User ${userId} is member of server ${guild.id} - vote benefits apply`,
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

    logger.info(`User ${userId} voted - AI system will give +10 daily limit`);

    try {
      const clientBot = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.MessageContent,
        ],
      });

      await clientBot.login(process.env.TOKEN);
      const user = await clientBot.users.fetch(userId);

      if (user) {
        const nextVoteTime = Math.floor((Date.now() + 12 * 60 * 60 * 1000) / 1000);
        await user
          .send(
            `🎉 **Thank you for voting for Aethel!**\n` +
              `\n` +
              `You've received **+10 AI daily limit** for today!\n` +
              `\n` +
              `You can vote again <t:${nextVoteTime}:R>\n` +
              `\n` +
              `Thank you for your support! ❤️`,
          )
          .catch(console.error);
      }

      clientBot.destroy().catch(console.error);
    } catch (error) {
      console.error('Failed to send vote thank you DM:', error);
    }

    await client.query('COMMIT');

    return {
      success: true,
      creditsAwarded: 10,
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
