import { Pool } from 'pg';
import {
  SocialMediaSubscription,
  SocialMediaPost,
  SocialPlatform,
  SocialMediaFetcher,
} from '../../types/social';

export class SocialMediaService {
  private pool: Pool;
  private fetchers: Map<SocialPlatform, SocialMediaFetcher>;
  private isPolling = false;
  private pollInterval: number = 5 * 60 * 1000;

  constructor(pool: Pool, fetchers: SocialMediaFetcher[]) {
    this.pool = pool;
    this.fetchers = new Map(fetchers.map((f) => [f.platform, f]));
  }

  async addSubscription(
    guildId: string,
    platform: SocialPlatform,
    accountHandle: string,
    channelId: string,
  ): Promise<SocialMediaSubscription> {
    const fetcher = this.fetchers.get(platform);
    if (!fetcher) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    if (!fetcher.isValidAccount(accountHandle)) {
      throw new Error(`Invalid account handle format for ${platform}`);
    }

    const result = await this.pool.query(
      `INSERT INTO server_social_subscriptions 
             (guild_id, platform, account_handle, channel_id)
             VALUES ($1, $2::social_platform, $3, $4)
             ON CONFLICT (guild_id, platform, account_handle) 
             DO UPDATE SET channel_id = $4
             RETURNING *`,
      [guildId, platform, accountHandle, channelId],
    );

    return this.mapDbToSubscription(result.rows[0]);
  }

  async removeSubscription(
    guildId: string,
    platform: SocialPlatform,
    accountHandle: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM server_social_subscriptions 
             WHERE guild_id = $1 AND platform = $2::social_platform AND account_handle = $3`,
      [guildId, platform, accountHandle],
    );

    return (result.rowCount || 0) > 0;
  }

  async listSubscriptions(guildId: string): Promise<SocialMediaSubscription[]> {
    const result = await this.pool.query(
      `SELECT * FROM server_social_subscriptions WHERE guild_id = $1`,
      [guildId],
    );

    return result.rows.map(this.mapDbToSubscription);
  }

  async checkForUpdates(): Promise<
    { post: SocialMediaPost; subscription: SocialMediaSubscription }[]
  > {
    const subscriptions = await this.getAllActiveSubscriptions();
    const newPosts: { post: SocialMediaPost; subscription: SocialMediaSubscription }[] = [];

    for (const sub of subscriptions) {
      try {
        const fetcher = this.fetchers.get(sub.platform as SocialPlatform);
        if (!fetcher) continue;

        const latestPost = await fetcher.fetchLatestPost(sub.accountHandle);
        if (latestPost) {
          if (!sub.lastPostTimestamp) {
            await this.updateLastPost(sub.id, latestPost.uri, latestPost.timestamp);
            continue;
          }

          if (this.isNewerPost(latestPost, sub)) {
            await this.updateLastPost(sub.id, latestPost.uri, latestPost.timestamp);
            newPosts.push({
              post: latestPost,
              subscription: sub,
            });
          }
        }
      } catch (error) {
        console.error(
          `Error checking updates for ${sub.platform} account ${sub.accountHandle}:`,
          error,
        );
      }
    }

    return newPosts;
  }

  startPolling(): void {
    if (this.isPolling) return;

    this.isPolling = true;
    const poll = async () => {
      if (!this.isPolling) return;

      try {
        await this.checkForUpdates();
      } catch (error) {
        console.error('Error during social media polling:', error);
      } finally {
        if (this.isPolling) {
          setTimeout(poll, this.pollInterval);
        }
      }
    };

    poll();
  }

  stopPolling(): void {
    this.isPolling = false;
  }

  private async getAllActiveSubscriptions(): Promise<SocialMediaSubscription[]> {
    const result = await this.pool.query(`SELECT * FROM server_social_subscriptions`);
    return result.rows.map(this.mapDbToSubscription);
  }

  private async updateLastPost(
    subscriptionId: number,
    postUri: string,
    postTimestamp: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE server_social_subscriptions 
             SET last_post_uri = $1, last_post_timestamp = $2
             WHERE id = $3`,
      [postUri, postTimestamp, subscriptionId],
    );
  }

  private isNewerPost(post: SocialMediaPost, subscription: SocialMediaSubscription): boolean {
    if (!subscription.lastPostTimestamp) return true;
    return post.timestamp > subscription.lastPostTimestamp;
  }

  private mapDbToSubscription(row: {
    id: number;
    guild_id: string;
    platform: SocialPlatform;
    account_handle: string;
    last_post_uri: string | null;
    last_post_timestamp: Date | null;
    channel_id: string;
    created_at: Date;
    updated_at: Date;
  }): SocialMediaSubscription {
    return {
      id: row.id,
      guildId: row.guild_id,
      platform: row.platform as SocialPlatform,
      accountHandle: row.account_handle,
      lastPostUri: row.last_post_uri ?? undefined,
      lastPostTimestamp: (row.last_post_timestamp as Date | null) ?? undefined,
      channelId: row.channel_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
