import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Pool } from 'pg';
import { HandleResolver } from '@atproto/identity';
import { SocialMediaService } from './SocialMediaService';
import { BlueskyFetcher, FediverseFetcher } from './fetchers/UnifiedFetcher';
import { JetstreamClient, JetstreamPostEvent } from './streams/JetstreamClient';
import { FediversePoller } from './streams/FediversePoller';
import { SocialMediaFetcher, SocialPlatform } from '../../types/social';
import { SocialMediaPost, SocialMediaSubscription } from '../../types/social';
import logger from '../../utils/logger';

export class SocialMediaManager {
  private socialService: SocialMediaService;
  private notificationService: NotificationService;
  private hybridPoller: HybridSocialMediaPoller;
  private isInitialized = false;
  private blueskyFetcher: BlueskyFetcher;

  constructor(
    private client: Client,
    private pool: Pool,
  ) {
    this.blueskyFetcher = new BlueskyFetcher();
    const fetchers: SocialMediaFetcher[] = [this.blueskyFetcher, new FediverseFetcher()];

    this.socialService = new SocialMediaService(pool, fetchers);
    this.notificationService = new NotificationService(client);
    this.hybridPoller = new HybridSocialMediaPoller(
      client,
      this.socialService,
      this.notificationService,
      this.blueskyFetcher,
    );
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    await this.hybridPoller.start();
    this.isInitialized = true;
    logger.info('SocialMediaManager initialized with hybrid streaming/polling architecture');
  }

  public getService(): SocialMediaService {
    return this.socialService;
  }

  public async onSubscriptionAdded(platform: SocialPlatform, accountHandle: string): Promise<void> {
    await this.hybridPoller.addAccount(platform, accountHandle);
  }

  public async onSubscriptionRemoved(
    platform: SocialPlatform,
    accountHandle: string,
  ): Promise<void> {
    const remaining = await this.socialService.getSubscriptionsForAccount(platform, accountHandle);
    if (remaining.length === 0) {
      this.hybridPoller.removeAccount(platform, accountHandle);
    }
  }

  public async refreshOnce(): Promise<number> {
    return this.hybridPoller.dedupedRefresh();
  }

  public getStats(): {
    jetstream: { connected: boolean; watchedDids: number; cursor: number | null };
    fediverse: { isRunning: boolean; accountCount: number; averageInterval: number };
  } {
    return this.hybridPoller.getStats();
  }

  public async cleanup(): Promise<void> {
    if (this.hybridPoller) {
      this.hybridPoller.stop();
    }
    this.isInitialized = false;
    logger.info('SocialMediaManager cleaned up');
  }
}

class NotificationService {
  constructor(private client: Client) { }

  async sendNotification(
    post: SocialMediaPost,
    subscription: SocialMediaSubscription,
  ): Promise<void> {
    try {
      const guild = this.client.guilds.cache.get(subscription.guildId);
      if (!guild) {
        logger.info(
          `Bot is not in guild ${subscription.guildId}. Skipping notification for ${post.platform} post.`,
        );
        return;
      }

      const channel = await this.client.channels.fetch(subscription.channelId);
      if (!channel) {
        logger.info(
          `Channel ${subscription.channelId} not found. Bot may not have access. Skipping notification.`,
        );
        return;
      }

      if (!this.isTextBasedAndSendable(channel)) {
        logger.info(
          `Channel ${subscription.channelId} is not text-capable. Skipping notification.`,
        );
        return;
      }

      const isGuildChannel = 'guild' in channel && channel.guild !== null;
      if (isGuildChannel && channel.guild.id !== subscription.guildId) {
        logger.info(
          `Channel ${subscription.channelId} does not belong to guild ${subscription.guildId}. Skipping notification.`,
        );
        return;
      }

      const embed = this.createEmbed(post);
      const button = this.createViewPostButton(post);

      await channel.send({
        embeds: [embed],
        components: [button],
      });
      logger.info(
        `Successfully sent notification for ${post.platform} post in guild ${subscription.guildId}`,
      );
    } catch (error) {
      logger.error('Error sending notification:', error);
    }
  }

  private createEmbed(post: SocialMediaPost): EmbedBuilder {
    const authorIcon = post.authorAvatarUrl ?? this.getPlatformIcon(post.platform);
    const authorName =
      post.authorDisplayName && post.authorDisplayName.trim().length > 0
        ? `${post.authorDisplayName} (@${post.author})`
        : `@${post.author}`;

    const cleanText = this.preserveSpacing(post.text ?? '');

    const embed = new EmbedBuilder()
      .setColor(this.getPlatformColor(post.platform))
      .setAuthor({ name: authorName, iconURL: authorIcon, url: this.getPostUrl(post) })
      .setTimestamp(post.timestamp)
      .setFooter({
        text: this.formatPlatformName(post.platform),
        iconURL: this.getPlatformIcon(post.platform),
      });

    if (cleanText && cleanText.trim().length > 0) {
      embed.setDescription(this.truncateText(cleanText, 4000));
    }

    if (post.spoiler_text && post.spoiler_text.trim().length > 0) {
      embed.setTitle(`⚠️ ${post.spoiler_text}`);
    }

    if (post.openGraphData && post.platform === 'bluesky') {
      const { title, description, url, image } = post.openGraphData;
      if (title && url) {
        const linkText = description
          ? `> **[${this.truncateText(title, 80)}](${url})**\n> ${this.truncateText(description, 120)}`
          : `> **[${this.truncateText(title, 80)}](${url})**`;

        embed.addFields({
          name: '\u200b',
          value: linkText,
        });

        if (image && (!post.mediaUrls || post.mediaUrls.length === 0)) {
          embed.setImage(image);
        }
      }
    }

    const isSensitive = this.isContentSensitive(post);

    if (post.mediaUrls && post.mediaUrls.length > 0) {
      if (isSensitive) {
        embed.addFields({
          name: '🔞 Sensitive Content',
          value: `This post contains ${post.mediaUrls.length} image${post.mediaUrls.length > 1 ? 's' : ''} marked as sensitive.`,
        });
      } else {
        const firstMedia = post.mediaUrls[0];
        if (this.isValidImageUrl(firstMedia)) {
          embed.setImage(firstMedia);
        }

        if (post.mediaUrls.length > 1) {
          const remaining = post.mediaUrls.length - 1;
          embed.addFields({ name: '📷', value: `+${remaining} more`, inline: true });
        }
      }
    }

    return embed;
  }

  private isMediaServiceUrl(url: string): boolean {
    if (!url) return false;
    const mediaServices = [
      'tenor.com',
      'giphy.com',
      'imgur.com',
      'gfycat.com',
      'media.tenor.com',
      'media.giphy.com',
      'i.imgur.com',
    ];
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return mediaServices.some((service) => hostname.includes(service));
    } catch {
      return false;
    }
  }

  private removeMediaServiceUrls(text: string): string {
    if (!text) return '';
    return text
      .replace(
        /https?:\/\/(?:www\.)?(?:tenor\.com|giphy\.com|imgur\.com|gfycat\.com|media\.tenor\.com|media\.giphy\.com|i\.imgur\.com)[^\s]*/gi,
        '',
      )
      .replace(/\n{2,}/g, '\n\n')
      .trim();
  }

  private isContentSensitive(post: SocialMediaPost): boolean {
    if (post.sensitive) {
      return true;
    }

    if (post.labels && post.labels.length > 0) {
      const nsfwLabels = ['sexual', 'porn', 'nudity', 'nsfw', 'adult', 'graphic-media'];
      return post.labels.some((label) =>
        nsfwLabels.some((nsfw) => label.val.toLowerCase().includes(nsfw)),
      );
    }

    return false;
  }

  private getPlatformColor(platform: string): number {
    switch (platform) {
      case 'bluesky':
        return 0x1185fe;
      case 'fediverse':
        return 0x6364ff;
      default:
        return 0x7289da;
    }
  }

  private getPlatformIcon(platform: string): string | undefined {
    switch (platform) {
      case 'bluesky':
        return 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Bluesky_Logo.svg/24px-Bluesky_Logo.svg.png';
      case 'fediverse':
        return 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Fediverse_logo_proposal.svg/64px-Fediverse_logo_proposal.svg.png';
      default:
        return undefined;
    }
  }

  private formatPlatformName(platform: string): string {
    return platform.charAt(0).toUpperCase() + platform.slice(1);
  }

  private createViewPostButton(post: SocialMediaPost) {
    const button = new ButtonBuilder()
      .setLabel('View Post')
      .setStyle(ButtonStyle.Link)
      .setURL(this.getPostUrl(post));

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private getPostUrl(post: SocialMediaPost): string {
    switch (post.platform) {
      case 'bluesky': {
        if (post.uri.startsWith('http')) return post.uri;
        const handle = post.author;
        const postId = post.uri.split('/').pop();
        return `https://bsky.app/profile/${handle}/post/${postId}`;
      }
      case 'fediverse':
        return post.uri;
      default:
        return post.uri;
    }
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  private preserveSpacing(text: string): string {
    if (!text) return '';

    let result = text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');

    result = result
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+$/gm, '')
      .replace(/[ \t]+/g, ' ')
      .trim();

    return result;
  }

  private isValidImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private isTextBasedAndSendable(
    channel: unknown,
  ): channel is { send: (options: unknown) => Promise<unknown> } & { isTextBased(): boolean } {
    const maybe = channel as { send?: unknown; isTextBased?: unknown };
    return (
      typeof maybe.send === 'function' &&
      typeof maybe.isTextBased === 'function' &&
      maybe.isTextBased()
    );
  }
}

class HybridSocialMediaPoller {
  private instanceId = crypto.randomUUID();
  private jetstreamClient: JetstreamClient | null = null;
  private fediversePoller: FediversePoller | null = null;
  private handleResolver = new HandleResolver();
  private didToHandleMap = new Map<string, string>();
  private handleToDidMap = new Map<string, string>();
  private isRunning = false;
  private activityDecayInterval: NodeJS.Timeout | null = null;

  private fallbackPollInterval: NodeJS.Timeout | null = null;
  private readonly FALLBACK_POLL_INTERVAL_MS = 2 * 60 * 1000;

  private recentlyAnnounced = new Map<string, number>();
  private readonly DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private fediverseFetcher: FediverseFetcher;
  private processingPosts = new Set<string>();

  constructor(
    private readonly client: Client,
    private readonly socialService: SocialMediaService,
    private readonly notificationService: NotificationService,
    private readonly blueskyFetcher: BlueskyFetcher,
  ) {
    this.fediverseFetcher = new FediverseFetcher();
    logger.debug(`HybridSocialMediaPoller: Initialized instance ${this.instanceId}`);
  }

  private isDuplicateAnnouncement(subscriptionId: number, postUri: string): boolean {
    const key = `${subscriptionId}:${postUri.trim().toLowerCase()}`;
    const existingTimestamp = this.recentlyAnnounced.get(key);

    if (existingTimestamp && Date.now() - existingTimestamp < this.DEDUP_TTL_MS) {
      return true;
    }

    return false;
  }

  private markAsAnnounced(subscriptionId: number, postUri: string): void {
    const key = `${subscriptionId}:${postUri.trim().toLowerCase()}`;
    this.recentlyAnnounced.set(key, Date.now());

    if (Math.random() < 0.1) {
      const cutoff = Date.now() - this.DEDUP_TTL_MS;
      for (const [k, v] of this.recentlyAnnounced.entries()) {
        if (v < cutoff) {
          this.recentlyAnnounced.delete(k);
        }
      }
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`HybridSocialMediaPoller [${this.instanceId}]: Already running`);
      return;
    }

    this.isRunning = true;
    logger.info(`HybridSocialMediaPoller [${this.instanceId}]: Starting hybrid architecture...`);

    await this.initializeJetstream();
    await this.initializeFediversePoller();

    this.activityDecayInterval = setInterval(
      () => {
        this.fediversePoller?.decayActivityCounts();
      },
      60 * 60 * 1000,
    );

    this.startFallbackPolling();

    logger.info(`HybridSocialMediaPoller [${this.instanceId}]: Started successfully`);
  }

  public stop(): void {
    if (!this.isRunning) return;

    logger.info(`HybridSocialMediaPoller [${this.instanceId}]: Stopping...`);
    this.isRunning = false;

    if (this.jetstreamClient) {
      this.jetstreamClient.disconnect();
      this.jetstreamClient = null;
    }

    if (this.fediversePoller) {
      this.fediversePoller.stop();
      this.fediversePoller = null;
    }

    if (this.activityDecayInterval) {
      clearInterval(this.activityDecayInterval);
      this.activityDecayInterval = null;
    }

    if (this.fallbackPollInterval) {
      clearInterval(this.fallbackPollInterval);
      this.fallbackPollInterval = null;
    }

    logger.info(`HybridSocialMediaPoller [${this.instanceId}]: Stopped`);
  }

  public async addAccount(platform: SocialPlatform, accountHandle: string): Promise<void> {
    if (platform === 'bluesky') {
      await this.addBlueskyAccount(accountHandle);
      await this.immediateCheck(platform, accountHandle);
    } else if (platform === 'fediverse') {
      this.fediversePoller?.addAccount(accountHandle);
      await this.immediateCheck(platform, accountHandle);
    }
  }

  private async immediateCheck(platform: SocialPlatform, accountHandle: string): Promise<void> {
    try {
      logger.debug(
        `HybridSocialMediaPoller: Performing immediate check for ${platform}:${accountHandle}`,
      );

      const subscriptions = await this.socialService.getSubscriptionsForAccount(
        platform,
        accountHandle,
      );
      if (subscriptions.length === 0) return;

      const fetcher = platform === 'bluesky' ? this.blueskyFetcher : this.fediverseFetcher;
      const post = await fetcher.fetchLatestPost(accountHandle);
      if (!post) {
        logger.debug(`HybridSocialMediaPoller: No posts found for ${accountHandle}`);
        return;
      }

      const normalizedUri = post.uri.trim().toLowerCase();

      for (const sub of subscriptions) {
        if (this.isDuplicateAnnouncement(sub.id, normalizedUri)) {
          logger.debug(
            `HybridSocialMediaPoller: Skipping duplicate immediate check for ${accountHandle} in guild ${sub.guildId}`,
          );
          continue;
        }

        if (!sub.lastPostTimestamp) {
          this.markAsAnnounced(sub.id, normalizedUri);

          await this.socialService.batchUpdateLastPost([sub.id], normalizedUri, post.timestamp);
          await this.notificationService.sendNotification(post, sub);

          logger.info(
            `HybridSocialMediaPoller: Announced initial post for ${accountHandle} to guild ${sub.guildId}`,
          );
        }
      }
    } catch (error) {
      logger.warn(`HybridSocialMediaPoller: Immediate check failed for ${accountHandle}:`, error);
    }
  }

  public removeAccount(platform: SocialPlatform, accountHandle: string): void {
    if (platform === 'bluesky') {
      const did = this.handleToDidMap.get(accountHandle.toLowerCase());
      if (did) {
        this.jetstreamClient?.removeDid(did);
        this.didToHandleMap.delete(did);
        this.handleToDidMap.delete(accountHandle.toLowerCase());
      }
    } else if (platform === 'fediverse') {
      this.fediversePoller?.removeAccount(accountHandle);
    }
  }

  public getStats(): {
    jetstream: { connected: boolean; watchedDids: number; cursor: number | null };
    fediverse: { isRunning: boolean; accountCount: number; averageInterval: number };
  } {
    const jetstreamStats = this.jetstreamClient?.getStats() ?? {
      connected: false,
      watchedDids: 0,
      cursor: null,
      reconnectAttempts: 0,
      lastMessageTime: 0,
    };

    const fediverseStats = this.fediversePoller?.getStats() ?? {
      isRunning: false,
      accountCount: 0,
      averageInterval: 0,
      failedAccounts: 0,
    };

    return {
      jetstream: {
        connected: jetstreamStats.connected,
        watchedDids: jetstreamStats.watchedDids,
        cursor: jetstreamStats.cursor,
      },
      fediverse: {
        isRunning: fediverseStats.isRunning,
        accountCount: fediverseStats.accountCount,
        averageInterval: fediverseStats.averageInterval,
      },
    };
  }

  private async initializeJetstream(): Promise<void> {
    if (this.jetstreamClient) {
      logger.warn(
        `HybridSocialMediaPoller [${this.instanceId}]: Overwriting existing JetstreamClient - potential leak detected`,
      );
      this.jetstreamClient.disconnect();
      this.jetstreamClient = null;
    }

    try {
      const blueskyAccounts = await this.socialService.getBlueskyAccounts();
      logger.info(
        `HybridSocialMediaPoller [${this.instanceId}]: Resolving ${blueskyAccounts.length} Bluesky accounts to DIDs...`,
      );

      const dids: string[] = [];
      for (const handle of blueskyAccounts) {
        try {
          const did = await this.resolveDid(handle);
          if (did) {
            dids.push(did);
            this.didToHandleMap.set(did, handle.toLowerCase());
            this.handleToDidMap.set(handle.toLowerCase(), did);
          }
        } catch (error) {
          logger.warn(
            `HybridSocialMediaPoller [${this.instanceId}]: Failed to resolve DID for ${handle}:`,
            error,
          );
        }
      }

      logger.info(
        `HybridSocialMediaPoller [${this.instanceId}]: Resolved ${dids.length}/${blueskyAccounts.length} DIDs`,
      );

      this.jetstreamClient = new JetstreamClient({
        wantedCollections: ['app.bsky.feed.post'],
        wantedDids: dids,
      });

      this.jetstreamClient.on('post', (event) => this.handleJetstreamPost(event));
      this.jetstreamClient.on('connected', () => {
        logger.info(
          `HybridSocialMediaPoller [${this.instanceId}]: Jetstream connected, watching ${dids.length} DIDs`,
        );
      });
      this.jetstreamClient.on('disconnected', (code, reason) => {
        logger.warn(
          `HybridSocialMediaPoller [${this.instanceId}]: Jetstream disconnected: ${code} - ${reason}`,
        );
      });
      this.jetstreamClient.on('error', (error) => {
        logger.error(`HybridSocialMediaPoller [${this.instanceId}]: Jetstream error:`, error);
      });

      this.jetstreamClient.connect();
    } catch (error) {
      logger.error(
        `HybridSocialMediaPoller [${this.instanceId}]: Failed to initialize Jetstream:`,
        error,
      );
    }
  }

  private async initializeFediversePoller(): Promise<void> {
    if (this.fediversePoller) {
      logger.warn(
        `HybridSocialMediaPoller [${this.instanceId}]: Overwriting existing FediversePoller - potential leak detected`,
      );
      this.fediversePoller.stop();
      this.fediversePoller = null;
    }

    try {
      const fediverseAccounts = await this.socialService.getFediverseAccounts();
      logger.info(
        `HybridSocialMediaPoller [${this.instanceId}]: Setting up poller for ${fediverseAccounts.length} Fediverse accounts`,
      );

      this.fediversePoller = new FediversePoller({
        baseInterval: 60_000,
        minInterval: 30_000,
        maxInterval: 5 * 60_000,
      });

      this.fediversePoller.addAccounts(fediverseAccounts);
      this.fediversePoller.on('post', async (post, handle) => {
        await this.handleFediversePost(post, handle);
      });

      this.fediversePoller.on('error', (error, handle) => {
        logger.warn(
          `HybridSocialMediaPoller [${this.instanceId}]: Fediverse error for ${handle}:`,
          error.message,
        );
      });

      this.fediversePoller.start();
    } catch (error) {
      logger.error(
        `HybridSocialMediaPoller [${this.instanceId}]: Failed to initialize Fediverse poller:`,
        error,
      );
    }
  }

  private async handleJetstreamPost(event: JetstreamPostEvent): Promise<void> {
    const { did, record: _record, uri } = event;
    const handle = this.didToHandleMap.get(did);

    if (!handle) {
      // We're not watching this DID, so ignore
      return;
    }

    // Immediate synchronous check for race condition
    const normalizedUri = uri.trim().toLowerCase();
    if (this.processingPosts.has(normalizedUri)) {
      logger.debug(
        `HybridSocialMediaPoller [${this.instanceId}]: Already processing post ${normalizedUri}, skipping race condition`,
      );
      return;
    }

    // Add to processing set immediately
    this.processingPosts.add(normalizedUri);

    try {
      // Also check recent history (in case it finished processing just before this check)
      // We check this again inside the subscriptions loop, but checking here saves resources
      // Note: We can't easily check per-subscription here without the subscription list,
      // but if we've announced this URI to *any* subscription recently, we might want to be careful.
      // However, the `isDuplicateAnnouncement` check inside the loop is the authoritative one for per-channel dedup.

      const subscriptions = await this.socialService.getSubscriptionsForAccount('bluesky', handle);
      if (subscriptions.length === 0) {
        logger.debug(
          `HybridSocialMediaPoller [${this.instanceId}]: No subscriptions for ${handle}`,
        );
        return;
      }

      logger.debug(
        `HybridSocialMediaPoller [${this.instanceId}]: Found ${subscriptions.length} subscriptions for ${handle}`,
        {
          subscriptionIds: subscriptions.map((s) => s.id),
          guildIds: subscriptions.map((s) => s.guildId),
          channelIds: subscriptions.map((s) => s.channelId),
        },
      );

      const post = await this.blueskyFetcher.fetchLatestPost(handle);
      if (!post) {
        logger.warn(
          `HybridSocialMediaPoller [${this.instanceId}]: Failed to fetch full post data for ${handle}`,
        );
        return;
      }

      for (const sub of subscriptions) {
        // Double check against recent history for this specific subscription
        if (this.isDuplicateAnnouncement(sub.id, normalizedUri)) {
          logger.debug(
            `HybridSocialMediaPoller [${this.instanceId}]: Skipping duplicate announcement for ${handle} in guild ${sub.guildId} (subId: ${sub.id})`,
          );
          continue;
        }

        const isNew =
          !sub.lastPostTimestamp ||
          post.timestamp > sub.lastPostTimestamp ||
          (post.timestamp.getTime() === sub.lastPostTimestamp?.getTime() &&
            normalizedUri !== sub.lastPostUri);

        if (isNew) {
          logger.info(
            `HybridSocialMediaPoller [${this.instanceId}]: Preparing to announce post for ${handle} to channel ${sub.channelId} (subId: ${sub.id})`,
          );
          this.markAsAnnounced(sub.id, normalizedUri);

          // Update DB first to minimize window for other pollers (if any exist)
          await this.socialService.batchUpdateLastPost([sub.id], normalizedUri, post.timestamp);
          await this.notificationService.sendNotification(post, sub);

          logger.info(
            `HybridSocialMediaPoller [${this.instanceId}]: Sent real-time notification for ${handle} to guild ${sub.guildId}`,
          );
        }
      }
    } catch (error) {
      logger.error(
        `HybridSocialMediaPoller [${this.instanceId}]: Error handling Jetstream post:`,
        error,
      );
    } finally {
      // Always remove from processing set
      this.processingPosts.delete(normalizedUri);
    }
  }

  private async handleFediversePost(post: SocialMediaPost, handle: string): Promise<void> {
    try {
      const subscriptions = await this.socialService.getSubscriptionsForAccount(
        'fediverse',
        handle,
      );
      if (subscriptions.length === 0) {
        return;
      }

      for (const sub of subscriptions) {
        const normalizedUri = post.uri.trim().toLowerCase();

        if (this.isDuplicateAnnouncement(sub.id, normalizedUri)) {
          logger.debug(
            `HybridSocialMediaPoller: Skipping duplicate Fediverse announcement for ${handle} in guild ${sub.guildId}`,
          );
          continue;
        }

        const isNew =
          !sub.lastPostTimestamp ||
          post.timestamp > sub.lastPostTimestamp ||
          (post.timestamp.getTime() === sub.lastPostTimestamp?.getTime() &&
            normalizedUri !== sub.lastPostUri);

        if (isNew) {
          this.markAsAnnounced(sub.id, normalizedUri);

          await this.socialService.batchUpdateLastPost([sub.id], normalizedUri, post.timestamp);
          await this.notificationService.sendNotification(post, sub);

          logger.info(
            `HybridSocialMediaPoller: Sent notification for Fediverse ${handle} to guild ${sub.guildId}`,
          );
        }
      }
    } catch (error) {
      logger.error('HybridSocialMediaPoller: Error handling Fediverse post:', error);
    }
  }

  private async addBlueskyAccount(handle: string): Promise<void> {
    try {
      const did = await this.resolveDid(handle);
      if (did) {
        this.didToHandleMap.set(did, handle.toLowerCase());
        this.handleToDidMap.set(handle.toLowerCase(), did);
        this.jetstreamClient?.addDid(did);
        logger.debug(`HybridSocialMediaPoller: Added Bluesky account ${handle} (${did})`);
      }
    } catch (error) {
      logger.warn(`HybridSocialMediaPoller: Failed to add Bluesky account ${handle}:`, error);
    }
  }

  private async resolveDid(handle: string): Promise<string | null> {
    if (handle.startsWith('did:')) {
      return handle;
    }

    let normalized = handle.startsWith('@') ? handle.slice(1) : handle;
    normalized = normalized.toLowerCase();
    if (!normalized.includes('.')) {
      normalized = `${normalized}.bsky.social`;
    }

    try {
      const did = await this.handleResolver.resolve(normalized);
      if (typeof did === 'string' && did.startsWith('did:')) {
        return did;
      }
    } catch (error) {
      logger.warn(`HybridSocialMediaPoller: Failed to resolve DID for ${handle}:`, error);
    }

    return null;
  }

  public async dedupedRefresh(): Promise<number> {
    try {
      const updates = await this.socialService.checkForUpdates();
      let count = 0;

      for (const { post, subscription } of updates) {
        const normalizedUri = post.uri.trim().toLowerCase();

        if (this.isDuplicateAnnouncement(subscription.id, normalizedUri)) {
          logger.debug(
            `HybridSocialMediaPoller [${this.instanceId}]: Skipping duplicate refresh for ${post.author} in guild ${subscription.guildId}`,
          );
          continue;
        }

        this.markAsAnnounced(subscription.id, normalizedUri);
        await this.notificationService.sendNotification(post, subscription);
        count++;
      }

      return count;
    } catch (error) {
      logger.error('HybridSocialMediaPoller: Deduped refresh error:', error);
      return 0;
    }
  }

  private startFallbackPolling(): void {
    this.fallbackPollInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const updates = await this.socialService.checkForUpdates();
        let sent = 0;

        for (const { post, subscription } of updates) {
          const normalizedUri = post.uri.trim().toLowerCase();

          if (this.isDuplicateAnnouncement(subscription.id, normalizedUri)) {
            logger.debug(
              `HybridSocialMediaPoller [${this.instanceId}]: Skipping duplicate fallback for ${post.author} in guild ${subscription.guildId}`,
            );
            continue;
          }

          this.markAsAnnounced(subscription.id, normalizedUri);
          await this.notificationService.sendNotification(post, subscription);
          sent++;
        }

        if (sent > 0) {
          logger.debug(
            `HybridSocialMediaPoller [${this.instanceId}]: Fallback poll sent ${sent} missed updates (filtered from ${updates.length})`,
          );
        }
      } catch (error) {
        logger.error('HybridSocialMediaPoller: Fallback poll error:', error);
      }
    }, this.FALLBACK_POLL_INTERVAL_MS);
  }
}

export let socialMediaManager: SocialMediaManager;

export function initializeSocialMediaManager(client: Client, pool: Pool): SocialMediaManager {
  if (!socialMediaManager) {
    socialMediaManager = new SocialMediaManager(client, pool);
  }
  return socialMediaManager;
}
