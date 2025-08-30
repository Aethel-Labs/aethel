import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { Pool } from 'pg';
import { SocialMediaService } from './SocialMediaService';
import { BlueskyFetcher, FediverseFetcher } from './fetchers/UnifiedFetcher';
import { SocialMediaFetcher } from '../../types/social';
import { SocialMediaPost, SocialMediaSubscription, OpenGraphData } from '../../types/social';
import logger from '../../utils/logger';

export class SocialMediaManager {
  private socialService: SocialMediaService;
  private notificationService: NotificationService;
  private poller: SocialMediaPoller;
  private isInitialized = false;

  constructor(
    private client: Client,
    private pool: Pool,
  ) {
    const fetchers: SocialMediaFetcher[] = [new BlueskyFetcher(), new FediverseFetcher()];

    this.socialService = new SocialMediaService(pool, fetchers);
    this.notificationService = new NotificationService(client);
    this.poller = new SocialMediaPoller(client, this.socialService, this.notificationService);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.poller.start();
    this.isInitialized = true;
  }

  public getService(): SocialMediaService {
    return this.socialService;
  }

  public async refreshOnce(): Promise<number> {
    const updates = await this.socialService.checkForUpdates();
    let count = 0;
    for (const { post, subscription } of updates) {
      try {
        await this.notificationService.sendNotification(post, subscription);
        count++;
      } catch (error) {
        console.error('Error sending notification during manual refresh:', error);
      }
    }
    return count;
  }

  public async cleanup(): Promise<void> {
    if (this.poller) {
      this.poller.stop();
    }
    this.isInitialized = false;
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
      await channel.send({ embeds: [embed], components: [button] });
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
        ? `${post.authorDisplayName} (${post.author})`
        : post.author;
    const cleanText = this.processPostText(post.text ?? '', post.openGraphData);

    const embed = new EmbedBuilder()
      .setColor(this.getPlatformColor(post.platform))
      .setAuthor({ name: authorName, iconURL: authorIcon })
      .setTimestamp(post.timestamp)
      .setFooter({
        text: `New post on ${this.formatPlatformName(post.platform)}`,
        iconURL: this.getPlatformIcon(post.platform),
      });

    if (cleanText && cleanText.trim().length > 0) {
      embed.setDescription(this.truncateText(cleanText, 1000));
    }

    if (post.openGraphData) {
      this.addOpenGraphFields(embed, post.openGraphData);
      logger.debug('Added OpenGraph data to embed:', {
        platform: post.platform,
        author: post.author,
        ogTitle: post.openGraphData.title,
      });
    }

    if (post.openGraphData?.image && this.isValidImageUrl(post.openGraphData.image)) {
      embed.setImage(post.openGraphData.image);
    } else if (post.mediaUrls && post.mediaUrls.length > 0) {
      embed.setImage(post.mediaUrls[0]);
    }

    return embed;
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
      .setLabel('🔗 View Post')
      .setStyle(ButtonStyle.Link)
      .setURL(this.getPostUrl(post));

    return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  }

  private getPostUrl(post: SocialMediaPost): string {
    switch (post.platform) {
      case 'bluesky': {
        const handle = post.author.split('@')[0];
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

    if (openGraphData && openGraphData.sourceUrl) {
      processedText = this.removeSpecificUrlFromText(processedText, openGraphData.sourceUrl);

      if (!processedText || processedText.trim().length === 0) {
        processedText = 'Shared a link';
      }
    } else {
      processedText = this.addProtocolToUrls(processedText);
    }

    return processedText;
  }

  private preserveSpacing(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\s+/gm, '')
      .replace(/\s+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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

    const result = processedLines
      .filter((line) => line.trim().length > 0)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return result.length > 0 ? result : text;
  }

  private addProtocolToUrls(text: string): string {
    const protocolLessUrlRegex =
      /(?<!https?:\/\/)(?<![\w.-])([a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]*\.(?:com|org|net|edu|gov|mil|int|xyz|io|co|me|ly|app|dev|tech|info|biz|name|tv|cc|uk|de|fr|jp|cn|au|us|ca|nl|be|it|es|ru|in|br|mx|ch|se|no|dk|fi|pl|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|gr|pt|ie|at|lu)(?:\/[^\s<>]*)?)\b/g;

    return text.replace(protocolLessUrlRegex, (match, url) => {
      if (text.indexOf('@' + url) !== -1) {
        return match;
      }
      return 'https://' + url;
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
    if (ogData.title || ogData.description) {
      let linkTitle = ogData.title || 'Link Preview';
      let linkDescription = ogData.description || 'No description available';

      if (linkTitle.length > 100) {
        linkTitle = linkTitle.substring(0, 97) + '...';
      }

      if (linkDescription.length > 200) {
        linkDescription = linkDescription.substring(0, 197) + '...';
      }

      const titleWithLink = ogData.url ? `[${linkTitle}](${ogData.url})` : linkTitle;

      const siteName = ogData.siteName ? ` • ${ogData.siteName}` : '';
      const quotedContent = `> **${titleWithLink}**${siteName}\n> ${linkDescription}`;

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

class SocialMediaPoller {
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
