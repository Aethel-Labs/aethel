export type SocialPlatform = 'bluesky' | 'fediverse';

export interface SocialMediaSubscription {
  id: number;
  guildId: string;
  platform: SocialPlatform;
  accountHandle: string;
  lastPostUri?: string;
  lastPostTimestamp?: Date;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialMediaPost {
  uri: string;
  text: string;
  author: string;
  timestamp: Date;
  platform: SocialPlatform;
  mediaUrls?: string[];
  authorAvatarUrl?: string;
  authorDisplayName?: string;
  sensitive?: boolean;
  spoiler_text?: string;
  labels?: Array<{ val: string; src?: string }>;
}

export interface SocialMediaFetcher {
  platform: SocialPlatform;
  fetchLatestPost(account: string): Promise<SocialMediaPost | null>;
  isValidAccount(account: string): boolean;
}
