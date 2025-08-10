import { SocialMediaFetcher, SocialMediaPost, SocialPlatform } from '../../../types/social';
import { HandleResolver } from '@atproto/identity';

interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
  };
  record: {
    text: string;
    createdAt: string;
  };
  embed?: {
    $type: string;
    images?: Array<{
      thumb: string;
      fullsize: string;
      alt: string;
    }>;
  };
}

interface BlueskyFeedItem {
  post?: BlueskyPost;
}

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(init || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class BlueskyFetcher implements SocialMediaFetcher {
  platform: SocialPlatform = 'bluesky';
  private readonly baseUrl = 'https://public.api.bsky.app';
  private readonly handleResolver = new HandleResolver();

  async fetchLatestPost(account: string): Promise<SocialMediaPost | null> {
    const actor = await this.resolveActor(account);
    const url = `${this.baseUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=1`;

    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const items = (data?.feed as BlueskyFeedItem[]) || [];
      if (!Array.isArray(items) || items.length === 0) return null;

      const post = items[0]?.post;
      if (!post || !post.record) return null;

      const actorId = post.author?.did || actor;
      const profile = await this.fetchBlueskyProfile(actorId);
      const avatarUrl = profile?.avatar ?? null;
      const displayName = profile?.displayName ?? post.author?.displayName;

      return this.mapToSocialMediaPost(post, avatarUrl || undefined, displayName);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching Bluesky post:', error);
      throw new Error(`Failed to fetch post from Bluesky: ${errorMessage}`);
    }
  }

  isValidAccount(account: string | null | undefined): boolean {
    if (!account) return false;

    if (account.startsWith('did:')) {
      return /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/.test(account);
    }

    const parts = account.split('@').filter(Boolean);
    if (parts.length < 2) return false;

    const handle = parts[0];
    const domain = parts.slice(1).join('@');

    const isValidHandle = /^[a-zA-Z0-9-]+$/.test(handle);
    const isValidDomain = /^[a-zA-Z0-9.-]+$/.test(domain);

    return isValidHandle && isValidDomain;
  }

  private normalizeHandle(handle: string): string {
    if (handle.startsWith('did:')) {
      return handle;
    }

    handle = handle.startsWith('@') ? handle.slice(1) : handle;
    if (!handle.includes('.')) {
      return `${handle}.bsky.social`.toLowerCase();
    }
    return handle.toLowerCase();
  }

  private async resolveActor(account: string): Promise<string> {
    const normalized = this.normalizeHandle(account);
    try {
      const did = await this.handleResolver.resolve(normalized);
      if (typeof did === 'string' && did.startsWith('did:')) {
        return did;
      }
    } catch (_error) {
      void 0;
    }
    return normalized;
  }

  private mapToSocialMediaPost(
    post: BlueskyPost,
    authorAvatarUrl?: string,
    authorDisplayName?: string,
  ): SocialMediaPost {
    const mediaUrls: string[] = [];

    if (post.embed?.$type === 'app.bsky.embed.images#view' && post.embed.images) {
      mediaUrls.push(...post.embed.images.map((img) => img.fullsize));
    }

    const text = post.record?.text ?? '';
    const createdAt = post.record?.createdAt ?? new Date().toISOString();
    const author = post.author?.handle ?? 'unknown';

    return {
      uri: post.uri,
      text,
      author,
      timestamp: new Date(createdAt),
      platform: 'bluesky',
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      authorAvatarUrl,
      authorDisplayName,
    };
  }

  private async fetchBlueskyProfile(
    actor: string,
  ): Promise<{ avatar?: string; displayName?: string } | null> {
    try {
      const url = `${this.baseUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) return null;
      const data = await res.json();
      const avatar = typeof data?.avatar === 'string' ? data.avatar : undefined;
      const displayName = typeof data?.displayName === 'string' ? data.displayName : undefined;
      return { avatar, displayName };
    } catch {
      return null;
    }
  }
}

interface FediverseAccount {
  username: string;
  acct: string;
  display_name: string;
  avatar: string;
}

interface FediverseAttachment {
  id: string;
  type: 'image' | 'video' | 'gifv' | 'audio' | 'unknown';
  url: string;
  preview_url: string;
  description?: string;
}

interface FediversePost {
  id: string;
  uri: string;
  url: string;
  in_reply_to_id: string | null;
  in_reply_to_account_id: string | null;
  account: FediverseAccount;
  content: string;
  created_at: string;
  reblogs_count: number;
  favourites_count: number;
  reblogged: boolean;
  favourited: boolean;
  sensitive: boolean;
  spoiler_text: string;
  visibility: 'public' | 'unlisted' | 'private' | 'direct';
  media_attachments: FediverseAttachment[];
  mentions: Array<{
    id: string;
    username: string;
    url: string;
    acct: string;
  }>;
  tags: Array<{ name: string; url: string }>;
  application?: {
    name: string;
    website?: string;
  };
  language: string | null;
  reblog: FediversePost | null;
}

export class FediverseFetcher implements SocialMediaFetcher {
  platform: SocialPlatform = 'fediverse';

  private validateFediverseAccount(username: string, domain: string | null): void {
    if (!domain) {
      throw new Error('Fediverse account must include a domain (e.g., user@instance.social)');
    }

    if (/^https?:\/\//i.test(username) || /^https?:\/\//i.test(domain)) {
      throw new Error('URL schemes (http/https) are not allowed in Fediverse accounts');
    }

    if (/[?#]/.test(username) || /[?#]/.test(domain)) {
      throw new Error('URL paths and query parameters are not allowed in Fediverse accounts');
    }

    const domainStr = domain as string;
    if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domainStr)) {
      throw new Error('Invalid domain format in Fediverse account');
    }

    if (!/^[a-z0-9_.-]+$/i.test(username)) {
      throw new Error('Invalid username format in Fediverse account');
    }
  }

  async fetchLatestPost(account: string): Promise<SocialMediaPost | null> {
    const [username, domain] = this.parseAccount(account);
    this.validateFediverseAccount(username, domain);

    const domainStr = domain as string;
    const apiUrl = `https://${domainStr}/api/v1/accounts/lookup?acct=${username}@${domainStr}`;

    try {
      const accountResponse = await fetchWithTimeout(apiUrl);
      if (!accountResponse.ok) {
        throw new Error(`Failed to fetch account: ${accountResponse.statusText}`);
      }

      const accountData = await accountResponse.json();

      if (!accountData?.id) {
        throw new Error('Invalid account data: missing account ID in response');
      }

      const accountId = accountData.id;
      const statusesUrl = `https://${domainStr}/api/v1/accounts/${accountId}/statuses?limit=1&exclude_replies=true&exclude_reblogs=true`;
      const statusResponse = await fetchWithTimeout(statusesUrl);

      if (!statusResponse.ok) {
        throw new Error(`Failed to fetch statuses: ${statusResponse.statusText}`);
      }

      const statuses = (await statusResponse.json()) as FediversePost[];
      if (!statuses || statuses.length === 0) {
        return null;
      }

      const post = this.mapToSocialMediaPost(statuses[0], domainStr);
      return post;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching Fediverse post:', error);
      throw new Error(`Failed to fetch post from Fediverse: ${errorMessage}`);
    }
  }

  isValidAccount(account: string): boolean {
    if (!account) return false;
    const parts = account.split('@').filter(Boolean);
    return parts.length >= 2 && parts.every((part) => part.length > 0);
  }

  private parseAccount(account: string): [string, string | null] {
    const cleanAccount = account.startsWith('@') ? account.slice(1) : account;
    const firstAt = cleanAccount.indexOf('@');

    if (firstAt === -1) {
      return [cleanAccount, null];
    }

    const username = cleanAccount.substring(0, firstAt);
    const domain = cleanAccount.substring(firstAt + 1);
    return [username, domain];
  }

  private mapToSocialMediaPost(post: FediversePost, domain: string): SocialMediaPost {
    if (post.reblog) {
      return this.mapToSocialMediaPost(post.reblog, domain);
    }

    const mediaUrls = post.media_attachments
      .filter((media) => media.type === 'image' || media.type === 'gifv')
      .map((media) => media.url);

    const acct = post.account.acct;
    const authorAcct = acct.includes('@') ? acct : `${acct}@${domain}`;

    return {
      uri: post.uri,
      text: post.content,
      author: authorAcct,
      timestamp: new Date(post.created_at),
      platform: 'fediverse',
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      authorAvatarUrl: post.account.avatar,
      authorDisplayName: post.account.display_name,
    };
  }
}
