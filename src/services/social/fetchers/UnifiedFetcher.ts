import { SocialMediaFetcher, SocialMediaPost, SocialPlatform } from '../../../types/social';
import { HandleResolver } from '@atproto/identity';
import { lookupWebFinger } from '@fedify/fedify';
import sanitizeHtml from 'sanitize-html';
import he from 'he';
import logger from '../../../utils/logger';
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
    reply?: {
      parent?: {
        uri: string;
        cid: string;
      };
      root?: {
        uri: string;
        cid: string;
      };
    };
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
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown, response?: Response): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true;
    if (error.message.includes('network')) return true;
    if (error.message.includes('ECONNRESET')) return true;
    if (error.message.includes('ETIMEDOUT')) return true;
  }

  if (response && response.status >= 500) return true;

  if (response && response.status === 429) return true;

  return false;
}

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

async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options.baseDelay ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);

      if (response.ok || !isRetryableError(null, response)) {
        return response;
      }

      lastResponse = response;

      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter && attempt < maxRetries) {
        const retryDelay = parseInt(retryAfter, 10) * 1000 || baseDelay * Math.pow(2, attempt);
        await sleep(Math.min(retryDelay, 30000));
        continue;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(error) || attempt === maxRetries) {
        throw lastError;
      }
    }

    if (attempt < maxRetries) {
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      await sleep(delay);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error('Fetch failed after retries');
}

export class BlueskyFetcher implements SocialMediaFetcher {
  platform: SocialPlatform = 'bluesky';
  private readonly baseUrl = 'https://public.api.bsky.app';
  private readonly handleResolver = new HandleResolver();
  private cache = new Map<string, CachedResult>();
  private lastRequest = 0;
  private readonly CACHE_TTL = 60 * 1000;
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
      const url = `${this.baseUrl}/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(actor)}&limit=10`; // Increased limit to find own posts

      const response = await fetchWithRetry(url);
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

      const postItem = items.find((item) => item.post?.author?.did === actor);
      const post = postItem?.post;

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

    if (post.embed?.$type === 'app.bsky.embed.recordWithMedia#view') {
      const recordWithMedia = post.embed as Record<string, unknown>;
      const media = recordWithMedia.media as Record<string, unknown> | undefined;

      if (media?.$type === 'app.bsky.embed.images#view' && Array.isArray(media.images)) {
        mediaUrls.push(
          ...media.images.map((img: Record<string, unknown>) => img.fullsize as string),
        );
      }
      if (media?.$type === 'app.bsky.embed.video#view' && typeof media.thumbnail === 'string') {
        mediaUrls.push(media.thumbnail);
      }
      if (media?.$type === 'app.bsky.embed.external#view') {
        const external = media.external as {
          uri: string;
          title: string;
          description: string;
          thumb?: string;
        };
        if (external && external.thumb) {
          mediaUrls.push(external.thumb);
        }
      }
    }

    if (post.embed?.$type === 'app.bsky.embed.video#view') {
      const videoEmbed = post.embed as Record<string, unknown>;
      if (typeof videoEmbed.thumbnail === 'string') {
        mediaUrls.push(videoEmbed.thumbnail);
      }
    }

    if (post.embed?.$type === 'app.bsky.embed.external#view') {
      const embedData = post.embed as Record<string, unknown>;
      const external = embedData.external as Record<string, unknown> | undefined;

      if (external?.uri && typeof external.uri === 'string') {
        const url = external.uri;
        const title = (typeof external.title === 'string' ? external.title : '') || '';
        const description =
          (typeof external.description === 'string' ? external.description : '') || '';

        const isVideoUrl =
          url.match(/\.(mp4|webm|mov|avi|mkv|m4v)$/i) ||
          url.includes('youtube.com') ||
          url.includes('youtu.be') ||
          url.includes('vimeo.com') ||
          url.includes('tiktok.com') ||
          url.includes('instagram.com/p/') ||
          url.includes('twitter.com/') ||
          url.includes('x.com/');

        const isVideoContent =
          title.toLowerCase().includes('video') ||
          description.toLowerCase().includes('video') ||
          title.toLowerCase().includes('watch') ||
          description.toLowerCase().includes('watch');

        if (isVideoUrl || isVideoContent) {
          // nothing here yet
        }

        if (external.thumb && typeof external.thumb === 'string') {
          mediaUrls.push(external.thumb);
        }
      }
    }
    let text = post.record?.text ?? '';
    if (post.record?.reply) {
      try {
        const parentUri = post.record.reply.parent?.uri;
        if (parentUri) {
          const parentPost = await this.fetchPost(parentUri);
          if (parentPost && parentPost.author && parentPost.author.handle) {
            text = `> Replying to @${parentPost.author.handle}\n\n${text}`;
          }
        }
      } catch (_e) {
        // Ignore
      }
    }

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
    }

    return socialPost;
  }

  private async fetchPost(uri: string): Promise<BlueskyPost | null> {
    try {
      if (!uri.startsWith('at://')) return null;

      const url = `${this.baseUrl}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`;
      const res = await fetchWithRetry(url, undefined, { maxRetries: 2 });
      if (!res.ok) return null;

      const data = await res.json();
      if (data && data.posts && Array.isArray(data.posts) && data.posts.length > 0) {
        return data.posts[0] as BlueskyPost;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchBlueskyProfile(
    actor: string,
  ): Promise<{ avatar?: string; displayName?: string } | null> {
    try {
      const url = `${this.baseUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
      const res = await fetchWithRetry(url, undefined, { maxRetries: 2 });
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
  private readonly CACHE_TTL = 60 * 1000;
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
        items = outbox.orderedItems.slice(0, 10);
      } else if (outbox.first) {
        const firstPageUrl =
          typeof outbox.first === 'string' ? outbox.first : (outbox.first as string);
        if (firstPageUrl && typeof firstPageUrl === 'string') {
          await new Promise((resolve) => setTimeout(resolve, 100));
          const firstPage = await this.fetchActivityPubObject(firstPageUrl);
          if (firstPage && firstPage.orderedItems && Array.isArray(firstPage.orderedItems)) {
            items = firstPage.orderedItems.slice(0, 10);
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
            (postObject.type === 'Note' ||
              postObject.type === 'Article' ||
              postObject.type === 'Page')
          ) {
            const attributedTo = postObject.attributedTo;
            const actorId = actor.id as string;

            let isAuthoredByActor = false;
            if (typeof attributedTo === 'string' && attributedTo === actorId) {
              isAuthoredByActor = true;
            } else if (Array.isArray(attributedTo) && attributedTo.includes(actorId)) {
              isAuthoredByActor = true;
            }

            if (isAuthoredByActor || !attributedTo) {
              return await this.mapActivityPubPostToSocialMediaPost(postObject, actor, domain);
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to fetch ActivityPub content from ${actorUri}:`, error);
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
        content = this.convertHtmlToText(post.content.join('\n'));
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

    const inReplyTo = post.inReplyTo;

    if (inReplyTo) {
      try {
        const replyToUrl =
          typeof inReplyTo === 'string'
            ? inReplyTo
            : (inReplyTo as { id?: string })?.id || (inReplyTo as { url?: string })?.url;

        if (replyToUrl && typeof replyToUrl === 'string') {
          const replyData = await this.fetchActivityPubObject(replyToUrl);
          if (replyData) {
            const replyActor = await this.fetchActivityPubObject(replyData.attributedTo as string);
            const replyAuthor =
              (typeof replyActor?.name === 'string' ? replyActor.name : null) ||
              (typeof replyActor?.preferredUsername === 'string'
                ? replyActor.preferredUsername
                : null) ||
              (typeof replyActor?.url === 'string' ? replyActor.url.split('/').pop() : null);

            if (replyAuthor && typeof replyAuthor === 'string') {
              content = `> Replying to @${replyAuthor}\n\n${content}`;
            }
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch reply context:', error);
      }
    }

    const mediaUrls: string[] = [];
    if (post.attachment && Array.isArray(post.attachment)) {
      for (const attachment of post.attachment) {
        if (
          (attachment.type === 'Document' ||
            attachment.type === 'Image' ||
            attachment.type === 'Video') &&
          attachment.url
        ) {
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
      uri:
        (typeof post.id === 'string' ? post.id : null) ||
        (typeof post.url === 'string' ? post.url : `unknown-${Date.now()}`),
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

    return socialPost;
  }

  private convertHtmlToText(html: string): string {
    const sanitized = sanitizeHtml(html, {
      allowedTags: ['br', 'p', 'div'],
      allowedAttributes: {},
    });

    let text = sanitized
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n');

    text = he.decode(text);

    text = text.replace(/<[^>]*>/g, '');

    return text.replace(/\n{3,}/g, '\n\n').trim();
  }
}

export class UnifiedFetcher implements SocialMediaFetcher {
  platform: SocialPlatform = 'bluesky';
  private blueskyFetcher: BlueskyFetcher;
  private fediverseFetcher: FediverseFetcher;
  private cache = new Map<string, CachedResult>();
  private readonly CACHE_TTL = 60 * 1000;

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
      logger.warn(`UnifiedFetcher: Failed to fetch post for ${account}:`, error);
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
      logger.warn(`UnifiedFetcher: Bluesky attempt failed for ${account}:`, error);
    }

    try {
      if (this.fediverseFetcher.isValidAccount(account)) {
        return await this.fediverseFetcher.fetchLatestPost(account);
      }
    } catch (error) {
      logger.warn(`UnifiedFetcher: Fediverse attempt failed for ${account}:`, error);
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
