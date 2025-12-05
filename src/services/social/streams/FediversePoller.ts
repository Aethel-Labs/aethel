import { EventEmitter } from 'events';
import { FediverseFetcher } from '../fetchers/UnifiedFetcher';
import { SocialMediaPost } from '../../../types/social';
import logger from '../../../utils/logger';

interface AccountActivity {
  handle: string;
  postsPerDay: number;
  lastPostTime: Date | null;
  pollInterval: number;
  failureCount: number;
  lastSuccessfulFetch: Date | null;
  lastPollTime: Date | null;
}

interface FediversePollerOptions {
  baseInterval?: number;
  minInterval?: number;
  maxInterval?: number;
  inactiveInterval?: number;
  failureThreshold?: number;
  maxFailureBackoff?: number;
}

interface FediversePollerEvents {
  post: (post: SocialMediaPost, handle: string) => void;
  error: (error: Error, handle: string) => void;
  activityUpdate: (handle: string, activity: AccountActivity) => void;
}

const DEFAULT_BASE_INTERVAL = 60 * 1000;
const DEFAULT_MIN_INTERVAL = 30 * 1000;
const DEFAULT_MAX_INTERVAL = 5 * 60 * 1000;
const DEFAULT_INACTIVE_INTERVAL = 5 * 60 * 1000;
const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_MAX_FAILURE_BACKOFF = 4;

export class FediversePoller extends EventEmitter {
  private fetcher: FediverseFetcher;
  private accounts = new Map<string, AccountActivity>();
  private pollTimeouts = new Map<string, NodeJS.Timeout>();
  private isRunning = false;
  private lastKnownPosts = new Map<string, string>();

  private readonly baseInterval: number;
  private readonly minInterval: number;
  private readonly maxInterval: number;
  private readonly inactiveInterval: number;
  private readonly failureThreshold: number;
  private readonly maxFailureBackoff: number;

  constructor(options: FediversePollerOptions = {}) {
    super();
    this.fetcher = new FediverseFetcher();
    this.baseInterval = options.baseInterval ?? DEFAULT_BASE_INTERVAL;
    this.minInterval = options.minInterval ?? DEFAULT_MIN_INTERVAL;
    this.maxInterval = options.maxInterval ?? DEFAULT_MAX_INTERVAL;
    this.inactiveInterval = options.inactiveInterval ?? DEFAULT_INACTIVE_INTERVAL;
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.maxFailureBackoff = options.maxFailureBackoff ?? DEFAULT_MAX_FAILURE_BACKOFF;
  }

  override on<K extends keyof FediversePollerEvents>(
    event: K,
    listener: FediversePollerEvents[K],
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof FediversePollerEvents>(
    event: K,
    ...args: Parameters<FediversePollerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  start(): void {
    if (this.isRunning) {
      logger.debug('FediversePoller: Already running');
      return;
    }

    this.isRunning = true;
    logger.info(`FediversePoller: Starting with ${this.accounts.size} accounts`);

    for (const handle of this.accounts.keys()) {
      this.scheduleNextPoll(handle);
    }
  }

  stop(): void {
    if (!this.isRunning) return;

    logger.info('FediversePoller: Stopping...');
    this.isRunning = false;

    for (const timeout of this.pollTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pollTimeouts.clear();

    logger.info('FediversePoller: Stopped');
  }

  addAccount(handle: string): void {
    if (!this.fetcher.isValidAccount(handle)) {
      logger.warn(`FediversePoller: Invalid account handle: ${handle}`);
      return;
    }

    const normalizedHandle = handle.toLowerCase();

    if (this.accounts.has(normalizedHandle)) {
      logger.debug(`FediversePoller: Account ${normalizedHandle} already registered`);
      return;
    }

    const activity: AccountActivity = {
      handle: normalizedHandle,
      postsPerDay: 0,
      lastPostTime: null,
      pollInterval: this.baseInterval,
      failureCount: 0,
      lastSuccessfulFetch: null,
      lastPollTime: null,
    };

    this.accounts.set(normalizedHandle, activity);
    logger.debug(`FediversePoller: Added account ${normalizedHandle}`);

    if (this.isRunning) {
      this.scheduleNextPoll(normalizedHandle);
    }
  }

  addAccounts(handles: string[]): number {
    let added = 0;
    for (const handle of handles) {
      const normalizedHandle = handle.toLowerCase();
      if (!this.accounts.has(normalizedHandle)) {
        this.addAccount(handle);
        added++;
      }
    }
    return added;
  }

  removeAccount(handle: string): boolean {
    const normalizedHandle = handle.toLowerCase();

    const timeout = this.pollTimeouts.get(normalizedHandle);
    if (timeout) {
      clearTimeout(timeout);
      this.pollTimeouts.delete(normalizedHandle);
    }

    const removed = this.accounts.delete(normalizedHandle);
    this.lastKnownPosts.delete(normalizedHandle);

    if (removed) {
      logger.debug(`FediversePoller: Removed account ${normalizedHandle}`);
    }

    return removed;
  }

  getAccountActivity(handle: string): AccountActivity | undefined {
    return this.accounts.get(handle.toLowerCase());
  }

  getAccounts(): string[] {
    return Array.from(this.accounts.keys());
  }

  getStats(): {
    isRunning: boolean;
    accountCount: number;
    averageInterval: number;
    failedAccounts: number;
  } {
    let totalInterval = 0;
    let failedCount = 0;

    for (const activity of this.accounts.values()) {
      totalInterval += activity.pollInterval;
      if (activity.failureCount >= this.failureThreshold) {
        failedCount++;
      }
    }

    return {
      isRunning: this.isRunning,
      accountCount: this.accounts.size,
      averageInterval: this.accounts.size > 0 ? Math.round(totalInterval / this.accounts.size) : 0,
      failedAccounts: failedCount,
    };
  }

  async pollNow(handle: string): Promise<SocialMediaPost | null> {
    const normalizedHandle = handle.toLowerCase();
    const activity = this.accounts.get(normalizedHandle);

    if (!activity) {
      logger.warn(`FediversePoller: Account ${handle} not registered`);
      return null;
    }

    const timeout = this.pollTimeouts.get(normalizedHandle);
    if (timeout) {
      clearTimeout(timeout);
      this.pollTimeouts.delete(normalizedHandle);
    }

    return this.pollAccount(normalizedHandle);
  }

  private scheduleNextPoll(handle: string): void {
    if (!this.isRunning) return;

    const activity = this.accounts.get(handle);
    if (!activity) return;

    const existingTimeout = this.pollTimeouts.get(handle);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const jitter = (Math.random() - 0.5) * 0.2 * activity.pollInterval;
    const delay = Math.max(this.minInterval, activity.pollInterval + jitter);

    const timeout = setTimeout(async () => {
      if (!this.isRunning) return;

      await this.pollAccount(handle);
      this.scheduleNextPoll(handle);
    }, delay);

    this.pollTimeouts.set(handle, timeout);
  }

  private async pollAccount(handle: string): Promise<SocialMediaPost | null> {
    const activity = this.accounts.get(handle);
    if (!activity) return null;

    activity.lastPollTime = new Date();

    try {
      const post = await this.fetcher.fetchLatestPost(handle);

      activity.failureCount = 0;
      activity.lastSuccessfulFetch = new Date();

      if (post) {
        const lastKnownUri = this.lastKnownPosts.get(handle);

        if (lastKnownUri !== post.uri) {
          this.lastKnownPosts.set(handle, post.uri);
          this.updateActivityOnNewPost(activity, post);
          this.emit('post', post, handle);

          logger.debug(
            `FediversePoller: New post from ${handle}, next poll in ${activity.pollInterval}ms`,
          );
        }

        return post;
      }

      return null;
    } catch (error) {
      activity.failureCount++;

      if (activity.failureCount >= this.failureThreshold) {
        const backoffMultiplier = Math.min(
          Math.pow(2, activity.failureCount - this.failureThreshold),
          this.maxFailureBackoff,
        );
        activity.pollInterval = Math.min(this.baseInterval * backoffMultiplier, this.maxInterval);
      }

      this.emit('error', error instanceof Error ? error : new Error(String(error)), handle);

      logger.warn(
        `FediversePoller: Failed to fetch ${handle} (attempt ${activity.failureCount}):`,
        error instanceof Error ? error.message : 'Unknown error',
      );

      return null;
    }
  }

  private updateActivityOnNewPost(activity: AccountActivity, post: SocialMediaPost): void {
    const now = new Date();

    if (activity.lastPostTime) {
      const timeSinceLastPost = now.getTime() - activity.lastPostTime.getTime();
      const hoursAgo = timeSinceLastPost / (1000 * 60 * 60);

      if (hoursAgo <= 24) {
        activity.postsPerDay++;
      } else {
        activity.postsPerDay = 1;
      }
    } else {
      activity.postsPerDay = 1;
    }

    activity.lastPostTime = post.timestamp;

    activity.pollInterval = this.calculateOptimalInterval(activity);

    this.emit('activityUpdate', activity.handle, activity);
  }

  private calculateOptimalInterval(activity: AccountActivity): number {
    if (activity.postsPerDay > 10) {
      return this.minInterval;
    }

    if (activity.postsPerDay >= 3) {
      return this.baseInterval;
    }

    if (activity.postsPerDay >= 1) {
      return this.baseInterval * 2;
    }

    if (activity.lastPostTime) {
      const hoursSinceLastPost = (Date.now() - activity.lastPostTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastPost >= 24) {
        return this.inactiveInterval;
      }

      if (hoursSinceLastPost >= 12) {
        return this.baseInterval * 3;
      }

      if (hoursSinceLastPost >= 6) {
        return this.baseInterval * 2;
      }
    }

    return this.baseInterval;
  }

  decayActivityCounts(): void {
    const now = Date.now();

    for (const activity of this.accounts.values()) {
      if (!activity.lastPostTime) continue;

      const hoursSinceLastPost = (now - activity.lastPostTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastPost >= 24) {
        activity.postsPerDay = Math.max(0, Math.floor(activity.postsPerDay * 0.5));
      } else if (hoursSinceLastPost >= 12) {
        activity.postsPerDay = Math.max(0, Math.floor(activity.postsPerDay * 0.75));
      }

      activity.pollInterval = this.calculateOptimalInterval(activity);
    }
  }
}

export function createFediversePoller(accounts?: string[]): FediversePoller {
  const poller = new FediversePoller({
    baseInterval: 60_000,
    minInterval: 30_000,
    maxInterval: 300_000,
  });

  if (accounts) {
    poller.addAccounts(accounts);
  }

  return poller;
}
