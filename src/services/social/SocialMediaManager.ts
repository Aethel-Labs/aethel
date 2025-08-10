import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { Pool } from 'pg';
import { SocialMediaService } from './SocialMediaService';
import { BlueskyFetcher, FediverseFetcher } from './fetchers/UnifiedFetcher';
import { SocialMediaFetcher } from '../../types/social';
import { SocialMediaPost, SocialMediaSubscription } from '../../types/social';
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
      const channel = (await this.client.channels.fetch(subscription.channelId)) as TextChannel;
      if (!channel) {
        console.error(`Channel ${subscription.channelId} not found`);
        return;
      }

      const embed = this.createEmbed(post);
      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  private createEmbed(post: SocialMediaPost): EmbedBuilder {
    const authorIcon = post.authorAvatarUrl ?? this.getPlatformIcon(post.platform);
    const authorName =
      post.authorDisplayName && post.authorDisplayName.trim().length > 0
        ? `${post.authorDisplayName} (${post.author})`
        : post.author;
    const embed = new EmbedBuilder()
      .setColor(this.getPlatformColor(post.platform))
      .setAuthor({ name: authorName, iconURL: authorIcon })
      .setDescription(this.truncateText(post.text, 1000))
      .setTimestamp(post.timestamp)
      .setFooter({
        text: `New post on ${this.formatPlatformName(post.platform)}`,
        iconURL: this.getPlatformIcon(post.platform),
      });

    if (post.mediaUrls && post.mediaUrls.length > 0) embed.setImage(post.mediaUrls[0]);
    embed.addFields([
      { name: 'View Post', value: `[Open in Browser](${this.getPostUrl(post)})`, inline: true },
    ]);
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
}
class SocialMediaPoller {
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 60 * 1000;

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

    this.checkForUpdates().catch((error) => {
      logger.error('Error in initial social media check:', error);
    });

    this.pollInterval = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        logger.error('Error in social media polling:', error);
      });
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
        logger.info(`Found ${newPosts.length} new social media posts`);
        for (const { post, subscription } of newPosts) {
          try {
            await this.notificationService.sendNotification(post, subscription);
            logger.debug(`Sent notification for ${post.platform} post by ${post.author}`);
          } catch (error) {
            logger.error(`Error sending notification for ${post.platform} post:`, error);
          }
        }
      } else {
        logger.debug('No new social media posts found');
      }
    } catch (error) {
      logger.error('Error checking for social media updates:', error);
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
