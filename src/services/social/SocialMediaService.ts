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

    const normalized = this.normalizeAccountHandle(platform, accountHandle);

    const result = await this.pool.query(
      `INSERT INTO server_social_subscriptions
             (guild_id, platform, account_handle, channel_id)
             VALUES ($1, $2::social_platform, $3, $4)
             ON CONFLICT (guild_id, platform, lower(account_handle))
             DO UPDATE SET channel_id = $4
             RETURNING *`,
      [guildId, platform, normalized, channelId],
    );

    return this.mapDbToSubscription(result.rows[0]);
  }

  async removeSubscription(
    guildId: string,
    platform: SocialPlatform,
    accountHandle: string,
  ): Promise<boolean> {
    const normalizedHandle = this.normalizeAccountHandle(platform, accountHandle);
    const result = await this.pool.query(
      `DELETE FROM server_social_subscriptions
             WHERE guild_id = $1 AND platform = $2::social_platform AND account_handle = $3`,
      [guildId, platform, normalizedHandle],
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
    const failedAccounts = new Set<string>();

    for (const sub of subscriptions) {
      const accountKey = `${sub.platform}:${sub.accountHandle}`;

      if (failedAccounts.has(accountKey)) {
        continue;
      }

      try {
        const fetcher = this.fetchers.get(sub.platform as SocialPlatform);
        if (!fetcher) {
          console.warn(`No fetcher found for platform: ${sub.platform}`);
          continue;
        }

        const latestPost = await fetcher.fetchLatestPost(sub.accountHandle);
        if (!latestPost) {
          continue;
        }

        const normalizedUri = this.normalizeUri(latestPost.uri);

        if (!sub.lastPostTimestamp) {
          await this.updateLastPost(sub.id, normalizedUri, latestPost.timestamp);
          continue;
        }

        if (this.isNewerPostWithLogging(latestPost, sub, normalizedUri)) {
          await this.updateLastPost(sub.id, normalizedUri, latestPost.timestamp);
          newPosts.push({
            post: { ...latestPost, uri: normalizedUri },
            subscription: sub,
          });
        }
      } catch (error) {
        console.warn(
          `Failed to check ${sub.platform} account ${sub.accountHandle}:`,
          error instanceof Error ? error.message : 'Unknown error',
        );

        failedAccounts.add(accountKey);
      }
    }

    if (newPosts.length > 0) {
      console.info(
        `Found ${newPosts.length} new social media posts across ${subscriptions.length} subscriptions`,
      );
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
    if (post.timestamp > subscription.lastPostTimestamp) return true;
    if (post.timestamp < subscription.lastPostTimestamp) return false;
    if (!subscription.lastPostUri) return true;
    return post.uri !== subscription.lastPostUri;
  }

  private isNewerPostWithLogging(
    post: SocialMediaPost,
    subscription: SocialMediaSubscription,
    normalizedUri: string,
  ): boolean {
    if (!subscription.lastPostTimestamp) return false;

    const isNewer =
      post.timestamp > subscription.lastPostTimestamp ||
      (post.timestamp.getTime() === subscription.lastPostTimestamp?.getTime() &&
        normalizedUri !== subscription.lastPostUri);

    return isNewer;
  }

  private normalizeUri(uri: string): string {
    return uri.trim().toLowerCase();
  }

  public async debugSubscription(
    guildId: string,
    platform: SocialPlatform,
    accountHandle: string,
  ): Promise<{
    subscription: SocialMediaSubscription | null;
    latestPost: SocialMediaPost | null;
    wouldAnnounce: boolean;
    reason: string;
  }> {
    const normalizedHandle = this.normalizeAccountHandle(platform, accountHandle);
    const result = await this.pool.query(
      `SELECT * FROM server_social_subscriptions WHERE guild_id = $1 AND platform = $2::social_platform AND account_handle = $3`,
      [guildId, platform, normalizedHandle],
    );

    if (result.rows.length === 0) {
      return {
        subscription: null,
        latestPost: null,
        wouldAnnounce: false,
        reason: 'No subscription found',
      };
    }

    const subscription = this.mapDbToSubscription(result.rows[0]);
    const fetcher = this.fetchers.get(platform);

    if (!fetcher) {
      return {
        subscription,
        latestPost: null,
        wouldAnnounce: false,
        reason: 'No fetcher available',
      };
    }

    try {
      const latestPost = await fetcher.fetchLatestPost(accountHandle);
      if (!latestPost) {
        return {
          subscription,
          latestPost: null,
          wouldAnnounce: false,
          reason: 'No posts found',
        };
      }

      const normalizedUri = this.normalizeUri(latestPost.uri);
      const wouldAnnounce = this.isNewerPostWithLogging(latestPost, subscription, normalizedUri);

      return {
        subscription,
        latestPost,
        wouldAnnounce,
        reason: wouldAnnounce ? 'New post detected' : 'Post already announced',
      };
    } catch (error) {
      return {
        subscription,
        latestPost: null,
        wouldAnnounce: false,
        reason: `Error fetching post: ${error}`,
      };
    }
  }

  private mapDbToSubscription(row: {
    id: number;
    guild_id: string;
    platform: SocialPlatform;
    account_handle: string;
    last_post_uri: string | null;
    last_post_timestamp: string | Date | null;
    channel_id: string;
    created_at: Date;
    updated_at: Date;
  }): SocialMediaSubscription {
    const lastPostTimestamp = row.last_post_timestamp ? new Date(row.last_post_timestamp) : null;

    return {
      id: row.id,
      guildId: row.guild_id,
      platform: row.platform as SocialPlatform,
      accountHandle: row.account_handle,
      lastPostUri: row.last_post_uri ?? undefined,
      lastPostTimestamp: lastPostTimestamp ?? undefined,
      channelId: row.channel_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private normalizeAccountHandle(platform: SocialPlatform, handle: string): string {
    let h = handle.trim();
    if (platform === 'bluesky') {
      if (h.startsWith('did:')) {
        return h;
      }
      h = h.startsWith('@') ? h.slice(1) : h;
      h = h.toLowerCase();
      if (!h.includes('.')) {
        h = `${h}.bsky.social`;
      }
      return h;
    }
    h = h.startsWith('@') ? h.slice(1) : h;
    return h.toLowerCase();
  }
}
