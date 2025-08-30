import { SocialMediaFetcher, SocialMediaPost, SocialPlatform } from '../../../types/social';
import { HandleResolver } from '@atproto/identity';
import { lookupWebFinger } from '@fedify/fedify';
import { extractFirstUrlMetadata } from '../../../utils/opengraph';
import sanitizeHtml from 'sanitize-html';
import he from 'he';
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
  embed?:
    | {
        $type: string;
        images?: Array<{
          thumb: string;
          fullsize: string;
          alt: string;
        }>;
        external?: {
          uri: string;
          title: string;
          description: string;
          thumb?: string;
        };
      }
    | {
        $type: 'app.bsky.embed.external#view';
        external: {
          uri: string;
          title: string;
          description: string;
          thumb?: string;
        };
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

interface CachedResult {
  post: SocialMediaPost | null;
  timestamp: number;
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
  private cache = new Map<string, CachedResult>();
  private lastRequest = 0;
  private readonly CACHE_TTL = 15 * 1000;
  private readonly MIN_REQUEST_INTERVAL = 1000;

  async fetchLatestPost(account: string): Promise<SocialMediaPost | null> {
    try {
      const cached = this.cache.get(account);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.post;
      }

      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequest;
      if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.MIN_REQUEST_INTERVAL - timeSinceLastRequest),
        );
      }
      this.lastRequest = Date.now();

      const actor = await this.resolveActor(account);
      const url = `${this.baseUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=1`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        this.cacheResult(account, null);
        return null;
      }

      const data = await response.json();
      const items = (data?.feed as BlueskyFeedItem[]) || [];
      if (!Array.isArray(items) || items.length === 0) {
        this.cacheResult(account, null);
        return null;
      }

      const post = items[0]?.post;
      if (!post || !post.record) {
        this.cacheResult(account, null);
        return null;
      }

      const actorId = post.author?.did || actor;
      const profile = await this.fetchBlueskyProfile(actorId);
      const avatarUrl = profile?.avatar ?? null;
      const displayName = profile?.displayName ?? post.author?.displayName;

      const socialPost = await this.mapToSocialMediaPost(post, avatarUrl || undefined, displayName);
      this.cacheResult(account, socialPost);
      return socialPost;
    } catch {
      this.cacheResult(account, null);
      return null;
    }
  }

  private cacheResult(account: string, post: SocialMediaPost | null): void {
    this.cache.set(account, {
      post,
      timestamp: Date.now(),
    });

    if (Math.random() < 0.1) {
      const cutoff = Date.now() - this.CACHE_TTL * 3;
      for (const [key, value] of this.cache.entries()) {
        if (value.timestamp < cutoff) {
          this.cache.delete(key);
        }
      }
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
    } catch {
      /* empty */
    }
    return normalized;
  }

  private async mapToSocialMediaPost(
    post: BlueskyPost,
    authorAvatarUrl?: string,
    authorDisplayName?: string,
  ): Promise<SocialMediaPost> {
    const mediaUrls: string[] = [];

    if (post.embed?.$type === 'app.bsky.embed.images#view' && post.embed.images) {
      mediaUrls.push(...post.embed.images.map((img) => img.fullsize));
    }

    const text = post.record?.text ?? '';
    const createdAt = post.record?.createdAt ?? new Date().toISOString();
    const author = post.author?.handle ?? 'unknown';

    const socialPost: SocialMediaPost = {
      uri: post.uri,
      text,
      author,
      timestamp: new Date(createdAt),
      platform: 'bluesky',
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      authorAvatarUrl,
      authorDisplayName,
      labels: post.labels,
    };

    if (post.embed?.$type === 'app.bsky.embed.external#view') {
      const external = (
        post.embed as {
          external: { uri: string; title: string; description: string; thumb?: string };
        }
      ).external;
      if (external) {
        socialPost.openGraphData = {
          title: external.title,
          description: external.description,
          image: external.thumb,
          url: external.uri,
          sourceUrl: external.uri,
        };
      }
    } else {
      try {
        const urlRegex =
          /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]*\.(?:com|org|net|edu|gov|mil|int|xyz|io|co|me|ly|app|dev|tech|info|biz|name|tv|cc|uk|de|fr|jp|cn|au|us|ca|nl|be|it|es|ru|in|br|mx|ch|se|no|dk|fi|pl|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|gr|pt|ie|at|lu)\b(?:\/[^\s<>]*)?/g;
        const matches = text.match(urlRegex);

        if (matches && matches.length > 0) {
          const originalUrl = matches[0].replace(/[.,;:!?)\]}>'"]*$/, '');
          let cleanUrl = originalUrl;

          if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            cleanUrl = 'https://' + cleanUrl;
          }

          const { fetchOpenGraphData } = await import('../../../utils/opengraph');
          const ogData = await fetchOpenGraphData(cleanUrl);
          if (ogData) {
            socialPost.openGraphData = {
              ...ogData,
              sourceUrl: originalUrl,
            };
          }
        }
      } catch (_error) {
        /* empty */
      }
    }

    return socialPost;
  }

  private async fetchBlueskyProfile(
    actor: string,
  ): Promise<{ avatar?: string; displayName?: string } | null> {
    try {
      const url = `${this.baseUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const avatar = typeof data?.avatar === 'string' ? data.avatar : undefined;
      const displayName = typeof data?.displayName === 'string' ? data.displayName : undefined;
      return { avatar, displayName };
    } catch {
      return null;
    }
  }
}

export class FediverseFetcher implements SocialMediaFetcher {
  platform: SocialPlatform = 'fediverse';
  private cache = new Map<string, CachedResult>();
  private domainRequests = new Map<string, number>();
  private readonly CACHE_TTL = 15 * 1000;
  private readonly MIN_DOMAIN_INTERVAL = 3 * 1000;
  private readonly timeout = 10000;
  private readonly userAgent = 'Aethel/2.0 (+https://aethel.xyz)';

  constructor() {
    /* empty */
  }

  async fetchLatestPost(account: string): Promise<SocialMediaPost | null> {
    try {
      const cached = this.cache.get(account);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.post;
      }

      const [username, domain] = this.parseAccount(account);
      if (!domain) {
        this.cacheResult(account, null);
        return null;
      }

      const now = Date.now();
      const lastRequest = this.domainRequests.get(domain) || 0;
      const timeSinceLast = now - lastRequest;
      if (timeSinceLast < this.MIN_DOMAIN_INTERVAL) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.MIN_DOMAIN_INTERVAL - timeSinceLast),
        );
      }
      this.domainRequests.set(domain, Date.now());

      const actorUri = await this.resolveActor(username, domain);
      if (!actorUri) {
        this.cacheResult(account, null);
        return null;
      }

      const post = await this.fetchLatestPostFromActor(actorUri, domain);
      this.cacheResult(account, post);
      return post;
    } catch {
      this.cacheResult(account, null);
      return null;
    }
  }

  private cacheResult(account: string, post: SocialMediaPost | null): void {
    this.cache.set(account, {
      post,
      timestamp: Date.now(),
    });

    if (Math.random() < 0.1) {
      const cutoff = Date.now() - this.CACHE_TTL * 3;
      for (const [key, value] of this.cache.entries()) {
        if (value.timestamp < cutoff) {
          this.cache.delete(key);
        }
      }
    }
  }

  isValidAccount(account: string): boolean {
    if (!account) return false;
    const [username, domain] = this.parseAccount(account);
    return !!(username && domain);
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

  private async resolveActor(username: string, domain: string): Promise<string | null> {
    try {
      const resource = `acct:${username}@${domain}`;
      const webfingerResult = await lookupWebFinger(resource);

      const actorLink = webfingerResult?.links?.find(
        (link) => link.rel === 'self' && link.type === 'application/activity+json',
      );

      return actorLink?.href || null;
    } catch {
      return null;
    }
  }

  private async fetchLatestPostFromActor(
    actorUri: string,
    domain: string,
  ): Promise<SocialMediaPost | null> {
    try {
      const actor = await this.fetchActivityPubObject(actorUri);

      if (!actor || (actor.type !== 'Person' && actor.type !== 'Service')) return null;

      const outboxUrl = actor.outbox;
      if (!outboxUrl || typeof outboxUrl !== 'string') return null;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const outbox = await this.fetchActivityPubObject(outboxUrl);

      if (!outbox || (outbox.type !== 'OrderedCollection' && outbox.type !== 'Collection')) {
        return null;
      }

      let items: Record<string, unknown>[] = [];
      if (outbox.orderedItems && Array.isArray(outbox.orderedItems)) {
        items = outbox.orderedItems.slice(0, 5);
      } else if (outbox.first) {
        const firstPageUrl =
          typeof outbox.first === 'string' ? outbox.first : (outbox.first as string);
        if (firstPageUrl && typeof firstPageUrl === 'string') {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const firstPage = await this.fetchActivityPubObject(firstPageUrl);
          if (firstPage && firstPage.orderedItems && Array.isArray(firstPage.orderedItems)) {
            items = firstPage.orderedItems.slice(0, 5);
          }
        }
      }

      for (const item of items) {
        if (item.type === 'Create' && item.object) {
          const postObject = item.object as Record<string, unknown>;
          if (
            typeof postObject === 'object' &&
            postObject &&
            'type' in postObject &&
            (postObject.type === 'Note' || postObject.type === 'Article') &&
            !('inReplyTo' in postObject && postObject.inReplyTo)
          ) {
            return await this.mapActivityPubPostToSocialMediaPost(postObject, actor, domain);
          }
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to fetch ActivityPub content from ${actorUri}:`, error);
      return null;
    }
  }

  private async fetchActivityPubObject(url: string): Promise<Record<string, unknown> | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/activity+json, application/ld+json, application/json',
            'User-Agent': this.userAgent,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          return null;
        }

        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }

  private async mapActivityPubPostToSocialMediaPost(
    post: Record<string, unknown>,
    actor: Record<string, unknown>,
    domain: string,
  ): Promise<SocialMediaPost> {
    let content = '';
    if (post.content) {
      if (typeof post.content === 'string') {
        content = this.convertHtmlToText(post.content);
      } else if (Array.isArray(post.content)) {
        content = this.convertHtmlToText(post.content.join(' '));
      } else if (
        typeof post.content === 'object' &&
        post.content &&
        'value' in post.content &&
        typeof (post.content as { value: string }).value === 'string'
      ) {
        content = this.convertHtmlToText((post.content as { value: string }).value);
      }
    }

    if (!content && post.summary) {
      const summaryText =
        typeof post.summary === 'string'
          ? post.summary
          : post.summary &&
              typeof post.summary === 'object' &&
              'value' in post.summary &&
              typeof (post.summary as { value: string }).value === 'string'
            ? (post.summary as { value: string }).value
            : '';
      content = this.convertHtmlToText(summaryText);
    }

    const mediaUrls: string[] = [];
    if (post.attachment && Array.isArray(post.attachment)) {
      for (const attachment of post.attachment) {
        if (attachment.type === 'Document' && attachment.url) {
          mediaUrls.push(attachment.url);
        }
      }
    }

    let authorHandle: string;
    if (actor.preferredUsername && domain) {
      authorHandle = `${actor.preferredUsername}@${domain}`;
    } else {
      authorHandle = `unknown@${domain}`;
    }

    let authorAvatarUrl: string | undefined;
    if (actor.icon) {
      if (typeof actor.icon === 'string') {
        authorAvatarUrl = actor.icon;
      } else if (
        typeof actor.icon === 'object' &&
        actor.icon &&
        'url' in actor.icon &&
        typeof (actor.icon as { url: string }).url === 'string'
      ) {
        authorAvatarUrl = (actor.icon as { url: string }).url;
      }
    }

    const socialPost: SocialMediaPost = {
      uri: (typeof post.id === 'string' ? post.id : null) || `unknown-${Date.now()}`,
      text: content,
      author: authorHandle,
      timestamp:
        post.published && typeof post.published === 'string'
          ? new Date(post.published)
          : new Date(),
      platform: 'fediverse',
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      authorAvatarUrl,
      authorDisplayName:
        (typeof actor.name === 'string' ? actor.name : null) ||
        (typeof actor.displayName === 'string' ? actor.displayName : undefined),
      sensitive: post.sensitive === true,
      spoiler_text: typeof post.summary === 'string' ? post.summary : undefined,
    };

    try {
      const urlRegex =
        /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]*\.(?:com|org|net|edu|gov|mil|int|xyz|io|co|me|ly|app|dev|tech|info|biz|name|tv|cc|uk|de|fr|jp|cn|au|us|ca|nl|be|it|es|ru|in|br|mx|ch|se|no|dk|fi|pl|cz|hu|ro|bg|hr|sk|si|ee|lv|lt|gr|pt|ie|at|lu)\b(?:\/[^\s<>]*)?/g;
      const matches = content.match(urlRegex);

      if (matches && matches.length > 0) {
        const originalUrl = matches[0].replace(/[.,;:!?)\]}>'"]*$/, '');
        let cleanUrl = originalUrl;

        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
          cleanUrl = 'https://' + cleanUrl;
        }

        const ogData = await extractFirstUrlMetadata(cleanUrl);
        if (ogData) {
          socialPost.openGraphData = {
            ...ogData,
            sourceUrl: originalUrl,
          };
        }
      }
    } catch (_error) {
      /* empty */
    }

    return socialPost;
  }

  private convertHtmlToText(html: string): string {
    const sanitized = sanitizeHtml(html, {
      allowedTags: [],
      allowedAttributes: {},
    });
    return he
      .decode(sanitized)
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

export class UnifiedFetcher implements SocialMediaFetcher {
  platform: SocialPlatform = 'bluesky';
  private blueskyFetcher: BlueskyFetcher;
  private fediverseFetcher: FediverseFetcher;
  private cache = new Map<string, CachedResult>();
  private readonly CACHE_TTL = 15 * 1000;

  constructor() {
    this.blueskyFetcher = new BlueskyFetcher();
    this.fediverseFetcher = new FediverseFetcher();
  }

  async fetchLatestPost(account: string): Promise<SocialMediaPost | null> {
    try {
      const cached = this.cache.get(account);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.post;
      }

      const platform = this.detectPlatform(account);
      let post: SocialMediaPost | null = null;

      switch (platform) {
        case 'bluesky':
          post = await this.blueskyFetcher.fetchLatestPost(account);
          break;
        case 'fediverse':
          post = await this.fediverseFetcher.fetchLatestPost(account);
          break;
        default:
          post = await this.tryBothPlatforms(account);
          break;
      }

      this.cacheResult(account, post);
      return post;
    } catch (error) {
      console.warn(`UnifiedFetcher: Failed to fetch post for ${account}:`, error);
      this.cacheResult(account, null);
      return null;
    }
  }

  isValidAccount(account: string): boolean {
    if (!account) return false;

    return (
      this.blueskyFetcher.isValidAccount(account) || this.fediverseFetcher.isValidAccount(account)
    );
  }

  private detectPlatform(account: string): SocialPlatform | 'unknown' {
    const cleanAccount = account.startsWith('@') ? account.slice(1) : account;

    if (cleanAccount.startsWith('did:')) {
      return 'bluesky';
    }

    const atIndex = cleanAccount.indexOf('@');
    if (atIndex !== -1) {
      const domain = cleanAccount.substring(atIndex + 1);

      if (domain === 'bsky.social' || domain === 'bsky.app') {
        return 'bluesky';
      }

      return 'fediverse';
    }

    if (!cleanAccount.includes('.')) {
      return 'bluesky';
    }

    return 'bluesky';
  }

  private async tryBothPlatforms(account: string): Promise<SocialMediaPost | null> {
    try {
      if (this.blueskyFetcher.isValidAccount(account)) {
        const blueskyPost = await this.blueskyFetcher.fetchLatestPost(account);
        if (blueskyPost) {
          return blueskyPost;
        }
      }
    } catch (error) {
      console.warn(`UnifiedFetcher: Bluesky attempt failed for ${account}:`, error);
    }

    try {
      if (this.fediverseFetcher.isValidAccount(account)) {
        return await this.fediverseFetcher.fetchLatestPost(account);
      }
    } catch (error) {
      console.warn(`UnifiedFetcher: Fediverse attempt failed for ${account}:`, error);
    }

    return null;
  }

  private cacheResult(account: string, post: SocialMediaPost | null): void {
    this.cache.set(account, {
      post,
      timestamp: Date.now(),
    });

    if (Math.random() < 0.1) {
      const cutoff = Date.now() - this.CACHE_TTL * 3;
      for (const [key, value] of this.cache.entries()) {
        if (value.timestamp < cutoff) {
          this.cache.delete(key);
        }
      }
    }
  }

  getFetcherForPlatform(platform: SocialPlatform): SocialMediaFetcher {
    switch (platform) {
      case 'bluesky':
        return this.blueskyFetcher;
      case 'fediverse':
        return this.fediverseFetcher;
      default:
        throw new Error(`Unknown platform: ${platform}`);
    }
  }

  clearCache(account?: string): void {
    if (account) {
      this.cache.delete(account);
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): { size: number; platforms: Record<string, number> } {
    const platforms: Record<string, number> = { bluesky: 0, fediverse: 0 };

    for (const [, cached] of this.cache) {
      if (cached.post) {
        platforms[cached.post.platform] = (platforms[cached.post.platform] || 0) + 1;
      }
    }

    return {
      size: this.cache.size,
      platforms,
    };
  }
}
