import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Pool } from 'pg';
import { HandleResolver } from '@atproto/identity';
import { SocialMediaService } from './SocialMediaService';
import { BlueskyFetcher, FediverseFetcher } from './fetchers/UnifiedFetcher';
import { JetstreamClient, JetstreamPostEvent } from './streams/JetstreamClient';
import { FediversePoller } from './streams/FediversePoller';
import { SocialMediaFetcher, SocialPlatform } from '../../types/social';
import { SocialMediaPost, SocialMediaSubscription, OpenGraphData } from '../../types/social';
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
    const updates = await this.socialService.checkForUpdates();
    let count = 0;
    for (const { post, subscription } of updates) {
      try {
        await this.notificationService.sendNotification(post, subscription);
        count++;
      } catch (error) {
        logger.error('Error sending notification during manual refresh:', error);
      }
    }
    return count;
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
  constructor(private client: Client) {}

  async sendNotification(
    post: SocialMediaPost,
    subscription: SocialMediaSubscription,
  ): Promise<void> {
    try {
      if (this.isNSFWPost(post)) {
        logger.warn(
          `Skipping NSFW ${post.platform} post from ${post.author} in guild ${subscription.guildId}`,
        );
        return;
      }

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

  private isNSFWPost(post: SocialMediaPost): boolean {
    const nsfwTags = ['#nsfw', '#adult', '#18+', '#porn', '#xxx', '#nudity', '#sensitive'];
    const lowerText = post.text?.toLowerCase() || '';

    if (nsfwTags.some((tag) => lowerText.includes(tag))) {
      logger.debug(`Post from ${post.author} contains NSFW tag in text`);
      return true;
    }

    if (post.platform === 'fediverse' && post.sensitive === true) {
      logger.debug(`Fediverse post from ${post.author} is marked as sensitive`);
      return true;
    }

    if (
      post.platform === 'bluesky' &&
      post.labels &&
      post.labels.some((label) =>
        ['nsfw', 'sexual', 'nudity', 'porn', 'explicit'].includes(label.val),
      )
    ) {
      logger.debug(
        `Bluesky post from ${post.author} has NSFW content label: ${post.labels.map((l) => l.val).join(', ')}`,
      );
      return true;
    }

    if (post.platform === 'fediverse' && post.spoiler_text && post.spoiler_text.length > 0) {
      const spoilerText = post.spoiler_text.toLowerCase();
      if (
        nsfwTags.some((tag) => spoilerText.includes(tag.replace('#', ''))) ||
        spoilerText.includes('nsfw') ||
        spoilerText.includes('adult') ||
        spoilerText.includes('18+')
      ) {
        logger.debug(
          `Fediverse post from ${post.author} has NSFW content warning: ${post.spoiler_text}`,
        );
        return true;
      }
    }

    return false;
  }

  private createEmbed(post: SocialMediaPost): EmbedBuilder {
    const authorIcon = post.authorAvatarUrl ?? this.getPlatformIcon(post.platform);
    const authorName =
      post.authorDisplayName && post.authorDisplayName.trim().length > 0
        ? `${post.authorDisplayName} (@${post.author})`
        : `@${post.author}`;

    const cleanText = this.processPostText(post.text ?? '', post.openGraphData);

    const embed = new EmbedBuilder()
      .setColor(this.getPlatformColor(post.platform))
      .setAuthor({ name: authorName, iconURL: authorIcon, url: this.getPostUrl(post) })
      .setTimestamp(post.timestamp)
      .setFooter({
        text: `${this.formatPlatformName(post.platform)}`,
        iconURL: this.getPlatformIcon(post.platform),
      });

    if (cleanText && cleanText.trim().length > 0) {
      embed.setDescription(this.truncateText(cleanText, 4000));
    }

    if (post.spoiler_text && post.spoiler_text.trim().length > 0) {
      embed.setTitle(`⚠️ ${post.spoiler_text}`);
    }

    if (post.openGraphData) {
      if (post.openGraphData.image && this.isValidImageUrl(post.openGraphData.image)) {
        embed.setImage(post.openGraphData.image);
      }

      if (post.openGraphData.title && post.openGraphData.title !== post.text) {
        const domain = this.getDomainFromUrl(
          post.openGraphData.url || post.openGraphData.sourceUrl || '',
        );
        const title = post.openGraphData.title;
        const desc = post.openGraphData.description
          ? `\n${this.truncateText(post.openGraphData.description, 200)}`
          : '';

        embed.addFields({
          name: `🔗 ${domain}`,
          value: `**[${title}](${post.openGraphData.url || post.openGraphData.sourceUrl})**${desc}`,
        });
      }
    }

    if (post.mediaUrls && post.mediaUrls.length > 0) {
      const firstMedia = post.mediaUrls[0];
      if (this.isValidImageUrl(firstMedia)) {
        embed.setImage(firstMedia);
      }

      if (post.mediaUrls.length > 1) {
        const remaining = post.mediaUrls.length - 1;
        const fieldVal = `+ ${remaining} more image${remaining > 1 ? 's' : ''} (Click 'View Post' to see all)`;
        embed.addFields({ name: '📷 Media', value: fieldVal });
      }
    }

    return embed;
  }

  private getDomainFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Link';
    }
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

  private processPostText(text: string, openGraphData?: OpenGraphData): string {
    let processedText = this.preserveSpacing(text);

    if (openGraphData?.sourceUrl) {
      if (openGraphData.sourceUrl.startsWith('https://')) {
        processedText = this.removeSpecificUrlFromText(processedText, openGraphData.sourceUrl);
      } else {
        processedText = this.removeSpecificUrlFromText(processedText, openGraphData.sourceUrl);
      }
    } else {
      processedText = this.addProtocolToUrls(processedText);
    }

    return processedText;
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
      .replace(/^\s+/gm, '')
      .replace(/\s+$/gm, '')
      .replace(/[ \t]+/g, ' ')
      .trim();

    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      return `[${text}](${url})`;
    });

    return result;
  }

  private removeSpecificUrlFromText(text: string, sourceUrl: string): string {
    const urlWithoutProtocol = sourceUrl.replace(/^https?:\/\//, '');
    const escapedUrlWithoutProtocol = urlWithoutProtocol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const lines = text.split('\n');
    const processedLines = lines.map((line) => {
      const isUrlOnlyLine = new RegExp(
        `^\\s*(?:https?:\\/\\/)?${escapedUrlWithoutProtocol}\\s*$`,
        'i',
      ).test(line);

      const isUrlAtLineEnd = new RegExp(
        `\\s+(?:https?:\\/\\/)?${escapedUrlWithoutProtocol}\\s*$`,
        'i',
      ).test(line);

      if (isUrlOnlyLine) {
        return '';
      } else if (isUrlAtLineEnd) {
        return line.replace(
          new RegExp(`\\s+(?:https?:\\/\\/)?${escapedUrlWithoutProtocol}\\s*$`, 'i'),
          '',
        );
      }

      return line;
    });

    return processedLines
      .filter((line) => line.trim().length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private addProtocolToUrls(text: string): string {
    const protocolLessUrlRegex =
      /(?<!['"])(?<!https?:\/\/)(?<![\w.-])([a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]*\.(?:com|org|net|edu|gov|mil|int|xyz|io|co|me|ly|app|dev|tech|info|biz|name|tv|cc|uk|de|fr|jp|cn|au|us|ca|nl|be|it|es|ru|in|br|mx|ch|se|no|dk|fi|pl|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|gr|pt|ie|at|lu)(?:\/[^\s<>]*)?)\b/g;

    return text.replace(protocolLessUrlRegex, (match, url) => {
      if (text.indexOf('@' + url) !== -1) {
        return match;
      }

      if (!match.startsWith('http://') && !match.startsWith('https://')) {
        return 'https://' + url;
      }

      return match;
    });
  }

  private isValidImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private extractUrlsFromText(text: string): string[] {
    const urlRegex =
      /https?:\/\/[^\s<>]+|(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]*\.(?:com|org|net|edu|gov|mil|int|xyz|io|co|me|ly|app|dev|tech|info|biz|name|tv|cc|uk|de|fr|jp|cn|au|us|ca|nl|be|it|es|ru|in|br|mx|ch|se|no|dk|fi|pl|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|gr|pt|ie|at|lu)\b(?:\/[^\s<>]*)?/g;
    const matches = text.match(urlRegex);
    if (!matches) return [];

    return matches
      .map((url) => {
        let cleanUrl = url.replace(/[.,;:!?)\]}>'"]*$/, '');

        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl;
        }

        return cleanUrl;
      })
      .filter((url) => {
        try {
          const parsed = new URL(url);
          const hostname = parsed.hostname.toLowerCase();
          return hostname.includes('.') && !hostname.endsWith('.') && !hostname.startsWith('.');
        } catch {
          return false;
        }
      })
      .slice(0, 2);
  }

  private addOpenGraphFields(embed: EmbedBuilder, ogData: OpenGraphData): void {
    if (!ogData.sourceUrl || !ogData.sourceUrl.startsWith('https://')) {
      return;
    }

    if (ogData.title || ogData.description) {
      let linkTitle = ogData.title || 'Link Preview';
      let linkDescription = ogData.description || 'No description available';

      linkTitle = linkTitle
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      linkDescription = linkDescription
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (linkTitle.length > 100) {
        linkTitle = linkTitle.substring(0, 97) + '...';
      }

      if (linkDescription.length > 200) {
        linkDescription = linkDescription.substring(0, 197) + '...';
      }

      const titleWithLink = ogData.url ? `[${linkTitle}](${ogData.url})` : linkTitle;
      const siteName = ogData.siteName ? ` • ${ogData.siteName}` : '';

      let quotedContent = `> **${titleWithLink}**${siteName}`;

      if (linkDescription.toLowerCase() !== linkTitle.toLowerCase()) {
        quotedContent += `\n> ${linkDescription}`;
      }

      const finalContent =
        quotedContent.length > 1020 ? quotedContent.substring(0, 1017) + '...' : quotedContent;

      embed.addFields([
        {
          name: '\u200b',
          value: finalContent,
          inline: false,
        },
      ]);
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
  private jetstreamClient: JetstreamClient | null = null;
  private fediversePoller: FediversePoller | null = null;
  private handleResolver = new HandleResolver();
  private didToHandleMap = new Map<string, string>();
  private handleToDidMap = new Map<string, string>();
  private isRunning = false;
  private activityDecayInterval: NodeJS.Timeout | null = null;

  private fallbackPollInterval: NodeJS.Timeout | null = null;
  private readonly FALLBACK_POLL_INTERVAL_MS = 2 * 60 * 1000;

  private fediverseFetcher: FediverseFetcher;

  constructor(
    private readonly client: Client,
    private readonly socialService: SocialMediaService,
    private readonly notificationService: NotificationService,
    private readonly blueskyFetcher: BlueskyFetcher,
  ) {
    this.fediverseFetcher = new FediverseFetcher();
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('HybridSocialMediaPoller: Already running');
      return;
    }

    this.isRunning = true;
    logger.info('HybridSocialMediaPoller: Starting hybrid architecture...');

    await this.initializeJetstream();
    await this.initializeFediversePoller();

    this.activityDecayInterval = setInterval(
      () => {
        this.fediversePoller?.decayActivityCounts();
      },
      60 * 60 * 1000,
    );

    this.startFallbackPolling();

    logger.info('HybridSocialMediaPoller: Started successfully');
  }

  public stop(): void {
    if (!this.isRunning) return;

    logger.info('HybridSocialMediaPoller: Stopping...');
    this.isRunning = false;

    this.jetstreamClient?.disconnect();
    this.jetstreamClient = null;
    this.fediversePoller?.stop();
    this.fediversePoller = null;

    if (this.activityDecayInterval) {
      clearInterval(this.activityDecayInterval);
      this.activityDecayInterval = null;
    }

    if (this.fallbackPollInterval) {
      clearInterval(this.fallbackPollInterval);
      this.fallbackPollInterval = null;
    }

    logger.info('HybridSocialMediaPoller: Stopped');
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
        if (!sub.lastPostTimestamp) {
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
    try {
      const blueskyAccounts = await this.socialService.getBlueskyAccounts();
      logger.info(
        `HybridSocialMediaPoller: Resolving ${blueskyAccounts.length} Bluesky accounts to DIDs...`,
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
          logger.warn(`HybridSocialMediaPoller: Failed to resolve DID for ${handle}:`, error);
        }
      }

      logger.info(
        `HybridSocialMediaPoller: Resolved ${dids.length}/${blueskyAccounts.length} DIDs`,
      );

      this.jetstreamClient = new JetstreamClient({
        wantedCollections: ['app.bsky.feed.post'],
        wantedDids: dids,
      });

      this.jetstreamClient.on('post', (event) => this.handleJetstreamPost(event));
      this.jetstreamClient.on('connected', () => {
        logger.info(`HybridSocialMediaPoller: Jetstream connected, watching ${dids.length} DIDs`);
      });
      this.jetstreamClient.on('disconnected', (code, reason) => {
        logger.warn(`HybridSocialMediaPoller: Jetstream disconnected: ${code} - ${reason}`);
      });
      this.jetstreamClient.on('error', (error) => {
        logger.error('HybridSocialMediaPoller: Jetstream error:', error);
      });

      this.jetstreamClient.connect();
    } catch (error) {
      logger.error('HybridSocialMediaPoller: Failed to initialize Jetstream:', error);
    }
  }

  private async initializeFediversePoller(): Promise<void> {
    try {
      const fediverseAccounts = await this.socialService.getFediverseAccounts();
      logger.info(
        `HybridSocialMediaPoller: Setting up poller for ${fediverseAccounts.length} Fediverse accounts`,
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
        logger.warn(`HybridSocialMediaPoller: Fediverse error for ${handle}:`, error.message);
      });

      this.fediversePoller.start();
    } catch (error) {
      logger.error('HybridSocialMediaPoller: Failed to initialize Fediverse poller:', error);
    }
  }

  private async handleJetstreamPost(event: JetstreamPostEvent): Promise<void> {
    try {
      const handle = this.didToHandleMap.get(event.did);
      if (!handle) {
        return;
      }

      const subscriptions = await this.socialService.getSubscriptionsForAccount('bluesky', handle);
      if (subscriptions.length === 0) {
        logger.debug(`HybridSocialMediaPoller: No subscriptions for ${handle}`);
        return;
      }

      const post = await this.blueskyFetcher.fetchLatestPost(handle);
      if (!post) {
        logger.warn(`HybridSocialMediaPoller: Failed to fetch full post data for ${handle}`);
        return;
      }

      for (const sub of subscriptions) {
        const normalizedUri = post.uri.trim().toLowerCase();

        const isNew =
          !sub.lastPostTimestamp ||
          post.timestamp > sub.lastPostTimestamp ||
          (post.timestamp.getTime() === sub.lastPostTimestamp?.getTime() &&
            normalizedUri !== sub.lastPostUri);

        if (isNew) {
          await this.socialService.batchUpdateLastPost([sub.id], normalizedUri, post.timestamp);

          await this.notificationService.sendNotification(post, sub);

          logger.info(
            `HybridSocialMediaPoller: Sent real-time notification for ${handle} to guild ${sub.guildId}`,
          );
        }
      }
    } catch (error) {
      logger.error('HybridSocialMediaPoller: Error handling Jetstream post:', error);
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

        const isNew =
          !sub.lastPostTimestamp ||
          post.timestamp > sub.lastPostTimestamp ||
          (post.timestamp.getTime() === sub.lastPostTimestamp?.getTime() &&
            normalizedUri !== sub.lastPostUri);

        if (isNew) {
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

  private startFallbackPolling(): void {
    this.fallbackPollInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        const updates = await this.socialService.checkForUpdates();

        for (const { post, subscription } of updates) {
          await this.notificationService.sendNotification(post, subscription);
        }

        if (updates.length > 0) {
          logger.debug(
            `HybridSocialMediaPoller: Fallback poll found ${updates.length} missed updates`,
          );
        }
      } catch (error) {
        logger.error('HybridSocialMediaPoller: Fallback poll error:', error);
      }
    }, this.FALLBACK_POLL_INTERVAL_MS);
  }
}

class _SocialMediaPoller {
  private isRunning = false;
  private inProgress = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 20 * 1000;

  constructor(
    private readonly client: Client,
    private readonly socialService: SocialMediaService,
    private readonly notificationService: NotificationService,
  ) {}

  public start(): void {
    if (this.isRunning) {
      logger.warn('Social media poller is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting social media poller...');

    this.safeCheckForUpdates();

    this.pollInterval = setInterval(() => {
      this.safeCheckForUpdates();
    }, this.POLL_INTERVAL_MS);
  }

  public stop(): void {
    if (!this.isRunning) return;
    logger.info('Stopping social media poller...');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  private async checkForUpdates(): Promise<void> {
    if (!this.isRunning) return;
    logger.debug('Checking for social media updates...');
    try {
      const newPosts = await this.socialService.checkForUpdates();
      if (newPosts.length > 0) {
        for (const { post, subscription } of newPosts) {
          try {
            await this.notificationService.sendNotification(post, subscription);
          } catch (error) {
            logger.error(`Error sending notification for ${post.platform} post:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('Error checking for social media updates:', error);
    }
  }

  private async safeCheckForUpdates(): Promise<void> {
    if (!this.isRunning || this.inProgress) {
      logger.debug('Poll already in progress, skipping...');
      return;
    }

    this.inProgress = true;
    try {
      const updates = await this.socialService.checkForUpdates();
      if (updates.length > 0) {
        logger.info(
          `Found ${updates.length} new social media posts across ${updates.length} subscriptions`,
        );
        await Promise.allSettled(
          updates.map(({ post, subscription }) =>
            this.notificationService.sendNotification(post, subscription),
          ),
        );
      } else {
        logger.debug('Social media polling completed - no new posts found');
      }
    } catch (error) {
      logger.error(
        'Error during social media update check:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.inProgress = false;
    }
  }
}

export let socialMediaManager: SocialMediaManager;

export function initializeSocialMediaManager(client: Client, pool: Pool): SocialMediaManager {
  if (!socialMediaManager) {
    socialMediaManager = new SocialMediaManager(client, pool);
  }
  return socialMediaManager;
}
