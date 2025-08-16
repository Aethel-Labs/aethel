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
  labels?: Array<{
    src: string;
    uri: string;
    val: string;
    cts?: string;
  }>;
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
    try {
      const actor = await this.resolveActor(account);
      const url = `${this.baseUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=1`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        if (response.status >= 500) {
          console.warn(`Bluesky API returned server error ${response.status}, skipping...`);
          return null;
        }

        if (response.status === 404 || response.status === 400) {
          console.warn(`Bluesky account ${account} not found or invalid`);
          return null;
        }

        console.warn(`Bluesky API error for ${account}: ${response.status} ${response.statusText}`);
        return null;
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
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`Bluesky request timeout for ${account}`);
        } else if (error.message.includes('Failed to fetch')) {
          console.warn(`Network error fetching Bluesky account ${account}: ${error.message}`);
        } else {
          console.warn(`Error fetching Bluesky post for ${account}: ${error.message}`);
        }
      } else {
        console.warn(`Unknown error fetching Bluesky post for ${account}`);
      }
      return null;
    }
  }

  isValidAccount(account: string | null | undefined): boolean {
    if (!account) return false;

    if (account.startsWith('did:')) {
      return /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/.test(account);
    }

    const normalizedAccount = account.startsWith('@') ? account.slice(1) : account;

    if (normalizedAccount.includes('@')) {
      const parts = normalizedAccount.split('@').filter(Boolean);
      if (parts.length < 2) return false;

      const handle = parts[0];
      const domain = parts[1];

      const isValidHandle = /^[a-zA-Z0-9-]+$/.test(handle);
      const isValidDomain = /^[a-zA-Z0-9.-]+$/.test(domain);

      return isValidHandle && isValidDomain;
    }

    const parts = normalizedAccount.split('.');
    const handle = parts[0];

    if (!/^[a-zA-Z0-9-]+$/.test(handle)) {
      return false;
    }

    if (parts.length > 1) {
      return parts.every((part) => /^[a-zA-Z0-9-]+$/.test(part));
    }

    return true;
  }

  private normalizeHandle(handle: string): string {
    if (handle.startsWith('did:')) {
      return handle;
    }

    handle = handle.startsWith('@') ? handle.slice(1) : handle;

    if (handle.includes('@')) {
      return handle.toLowerCase();
    } else if (!handle.includes('.')) {
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

    const postUri = post.uri;

    return {
      uri: postUri,
      text,
      author,
      timestamp: new Date(createdAt),
      platform: 'bluesky',
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      authorAvatarUrl,
      authorDisplayName,
      labels: post.labels,
    };
  }

  private async fetchBlueskyProfile(
    actor: string,
  ): Promise<{ avatar?: string; displayName?: string } | null> {
    try {
      const url = `${this.baseUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        if (res.status >= 500) {
          console.warn(`Bluesky API returned server error ${res.status} for profile lookup`);
        } else if (res.status === 404) {
          console.warn(`Bluesky profile not found for actor ${actor}`);
        } else {
          console.warn(`Bluesky profile API error for ${actor}: ${res.status} ${res.statusText}`);
        }
        return null;
      }
      const data = await res.json();
      const avatar = typeof data?.avatar === 'string' ? data.avatar : undefined;
      const displayName = typeof data?.displayName === 'string' ? data.displayName : undefined;
      return { avatar, displayName };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`Bluesky profile request timeout for ${actor}`);
        } else {
          console.warn(`Error fetching Bluesky profile for ${actor}: ${error.message}`);
        }
      } else {
        console.warn(`Unknown error fetching Bluesky profile for ${actor}`);
      }
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

    try {
      const apiUrl = `https://${domainStr}/api/v1/accounts/lookup?acct=${username}@${domainStr}`;
      const accountResponse = await fetchWithTimeout(apiUrl);

      if (!accountResponse.ok) {
        if (accountResponse.status >= 500) {
          console.warn(
            `Fediverse instance ${domainStr} returned server error ${accountResponse.status}, skipping...`,
          );
          return null;
        }

        if (accountResponse.status === 404) {
          console.warn(`Fediverse account ${account} not found on ${domainStr}`);
          return null;
        }

        console.warn(
          `Fediverse API error for ${account}: ${accountResponse.status} ${accountResponse.statusText}`,
        );
        return null;
      }

      const accountData = await accountResponse.json();

      if (!accountData?.id) {
        console.warn(`Invalid account data for ${account}: missing account ID`);
        return null;
      }

      const accountId = accountData.id;
      const statusesUrl = `https://${domainStr}/api/v1/accounts/${accountId}/statuses?limit=1&exclude_replies=true&exclude_reblogs=true`;
      const statusResponse = await fetchWithTimeout(statusesUrl);

      if (!statusResponse.ok) {
        if (statusResponse.status >= 500) {
          console.warn(
            `Fediverse instance ${domainStr} returned server error ${statusResponse.status} for statuses, skipping...`,
          );
          return null;
        }

        console.warn(
          `Fediverse statuses API error for ${account}: ${statusResponse.status} ${statusResponse.statusText}`,
        );
        return null;
      }

      const statuses = (await statusResponse.json()) as FediversePost[];
      if (!statuses || !Array.isArray(statuses) || statuses.length === 0) {
        return null;
      }

      const post = this.mapToSocialMediaPost(statuses[0], domainStr);
      return post;
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`Fediverse request timeout for ${account}@${domainStr}`);
        } else if (error.message.includes('Failed to fetch')) {
          console.warn(`Network error fetching Fediverse account ${account}: ${error.message}`);
        } else {
          console.warn(`Error fetching Fediverse post for ${account}: ${error.message}`);
        }
      } else {
        console.warn(`Unknown error fetching Fediverse post for ${account}`);
      }
      return null;
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

  private async fetchFediverseProfile(
    account: string,
  ): Promise<{ displayName?: string; avatar?: string } | null> {
    const [username, instance] = account.split('@');
    if (!username || !instance) return null;

    const url = `https://${instance}/api/v1/accounts/lookup?acct=${username}`;

    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        if (response.status >= 500) {
          console.warn(`Fediverse instance ${instance} returned server error ${response.status}`);
        } else if (response.status === 404) {
          console.warn(`Fediverse account ${account} not found`);
        } else {
          console.warn(
            `Fediverse API error for ${account}: ${response.status} ${response.statusText}`,
          );
        }
        return null;
      }

      const data = await response.json();
      return {
        displayName: data.display_name || data.username,
        avatar: data.avatar_static || data.avatar,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.warn(`Fediverse request timeout for ${account}`);
        } else {
          console.warn(`Error fetching Fediverse profile for ${account}: ${error.message}`);
        }
      } else {
        console.warn(`Unknown error fetching Fediverse profile for ${account}`);
      }
      return null;
    }
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
      sensitive: post.sensitive,
      spoiler_text: post.spoiler_text,
    };
  }
}
