import { EventEmitter } from 'events';
import logger from '../../../utils/logger';

type WebSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

async function getWebSocketImpl(): Promise<new (url: string) => WebSocketLike> {
  if (typeof globalThis.WebSocket !== 'undefined') {
    return globalThis.WebSocket as unknown as new (url: string) => WebSocketLike;
  }
  const ws = await import('ws');
  return ws.default as unknown as new (url: string) => WebSocketLike;
}

export interface JetstreamCommitEvent {
  did: string;
  time_us: number;
  kind: 'commit';
  commit: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
    record?: BlueskyPostRecord;
    cid?: string;
  };
}

export interface JetstreamIdentityEvent {
  did: string;
  time_us: number;
  kind: 'identity';
  identity: {
    did: string;
    handle: string;
    seq: number;
    time: string;
  };
}

export interface JetstreamAccountEvent {
  did: string;
  time_us: number;
  kind: 'account';
  account: {
    active: boolean;
    did: string;
    seq: number;
    time: string;
    status?: string;
  };
}

export type JetstreamEvent = JetstreamCommitEvent | JetstreamIdentityEvent | JetstreamAccountEvent;

export interface BlueskyPostRecord {
  $type: 'app.bsky.feed.post';
  text: string;
  createdAt: string;
  langs?: string[];
  reply?: {
    parent: { uri: string; cid: string };
    root: { uri: string; cid: string };
  };
  embed?: {
    $type: string;
    images?: Array<{
      alt: string;
      image: { ref: { $link: string }; mimeType: string; size: number };
    }>;
    external?: {
      uri: string;
      title: string;
      description: string;
      thumb?: { ref: { $link: string }; mimeType: string; size: number };
    };
    video?: {
      ref: { $link: string };
      mimeType: string;
      size: number;
    };
  };
  facets?: Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{
      $type: string;
      uri?: string;
      did?: string;
      tag?: string;
    }>;
  }>;
  labels?: {
    $type: 'com.atproto.label.defs#selfLabels';
    values: Array<{ val: string }>;
  };
}

export interface JetstreamPostEvent {
  did: string;
  uri: string;
  cid: string;
  record: BlueskyPostRecord;
  timestamp: number;
}

interface JetstreamOptions {
  endpoints?: string[];
  wantedCollections?: string[];
  wantedDids?: string[];
  cursor?: number;
  compress?: boolean;
  requireHello?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  reconnectMaxDelay?: number;
  maxFailuresBeforeRelaySwitch?: number;
  persistCursor?: (cursor: number) => Promise<void> | void;
  loadCursor?: () => Promise<number | null> | number | null;
}

interface JetstreamClientEvents {
  post: (event: JetstreamPostEvent) => void;
  identity: (event: JetstreamIdentityEvent) => void;
  account: (event: JetstreamAccountEvent) => void;
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (error: Error) => void;
  cursorUpdate: (cursor: number) => void;
}

const DEFAULT_ENDPOINTS = [
  'wss://jetstream1.us-east.bsky.network/subscribe',
  'wss://jetstream2.us-east.bsky.network/subscribe',
  'wss://jetstream1.us-west.bsky.network/subscribe',
  'wss://jetstream2.us-west.bsky.network/subscribe',
  'wss://jetstream1.eurosky.network/subscribe',
];
const MAX_DIDS_PER_CONNECTION = 10_000;

export class JetstreamClient extends EventEmitter {
  private instanceId = crypto.randomUUID();
  private ws: WebSocketLike | null = null;
  private WebSocketClass: (new (url: string) => WebSocketLike) | null = null;
  private watchedDids = new Set<string>();
  private reconnectAttempts = 0;
  private cursor: number | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cursorFlushInterval: NodeJS.Timeout | null = null;
  private lastMessageTime = 0;
  private relayIdx = 0;
  private consecutiveFailures = 0;
  private pendingCursorFlush: number | null = null;

  private readonly endpoints: string[];
  private readonly wantedCollections: string[];
  private readonly compress: boolean;
  private readonly requireHello: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelay: number;
  private readonly reconnectMaxDelay: number;
  private readonly maxFailuresBeforeRelaySwitch: number;
  private readonly persistCursor?: (cursor: number) => Promise<void> | void;
  private readonly loadCursor?: () => Promise<number | null> | number | null;

  constructor(options: JetstreamOptions = {}) {
    super();
    this.endpoints =
      options.endpoints && options.endpoints.length > 0 ? options.endpoints : DEFAULT_ENDPOINTS;
    this.wantedCollections = options.wantedCollections || ['app.bsky.feed.post'];
    this.compress = options.compress ?? false;
    this.requireHello = options.requireHello ?? true;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 0;
    this.reconnectBaseDelay = options.reconnectBaseDelay ?? 1000;
    this.reconnectMaxDelay = options.reconnectMaxDelay ?? 30000;
    this.maxFailuresBeforeRelaySwitch = options.maxFailuresBeforeRelaySwitch ?? 2;
    this.persistCursor = options.persistCursor;
    this.loadCursor = options.loadCursor;

    if (options.wantedDids) {
      options.wantedDids.forEach((did) => this.watchedDids.add(did));
    }

    if (options.cursor) {
      this.cursor = options.cursor;
    }

    logger.debug(`JetstreamClient: Initialized instance ${this.instanceId}`);
  }

  override on<K extends keyof JetstreamClientEvents>(
    event: K,
    listener: JetstreamClientEvents[K],
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof JetstreamClientEvents>(
    event: K,
    ...args: Parameters<JetstreamClientEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  async connect(): Promise<void> {
    if (this.ws || this.isConnecting) {
      logger.debug(`JetstreamClient [${this.instanceId}]: Already connected or connecting`);
      return;
    }

    // Load the persisted cursor before connecting so we resume from where we
    // left off instead of replaying recent history (which caused duplicate
    // notifications after every reconnect). This mirrors atregistrar's firehose
    // consumers, which reload `jetstream_cursor` from the KV store on every
    // (re)connect.
    if (this.loadCursor && this.cursor === null) {
      try {
        const persisted = await this.loadCursor();
        if (typeof persisted === 'number' && persisted > 0) {
          this.cursor = persisted;
          logger.info(
            `JetstreamClient [${this.instanceId}]: Resumed cursor from store: ${persisted}`,
          );
        }
      } catch (error) {
        logger.warn(
          `JetstreamClient [${this.instanceId}]: Failed to load persisted cursor:`,
          error,
        );
      }
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    const url = this.buildConnectionUrl();
    logger.info(
      `JetstreamClient [${this.instanceId}]: Connecting to ${this.endpoints[this.relayIdx]} (cursor=${this.cursor ?? 'none'})`,
    );

    try {
      if (!this.WebSocketClass) {
        this.WebSocketClass = await getWebSocketImpl();
      }

      this.ws = new this.WebSocketClass(url);
      this.setupWebSocketHandlers();
    } catch (error) {
      this.isConnecting = false;
      logger.error(`JetstreamClient [${this.instanceId}]: Failed to create WebSocket:`, error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    logger.info(`JetstreamClient [${this.instanceId}]: Disconnecting...`);
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.cursorFlushInterval) {
      clearInterval(this.cursorFlushInterval);
      this.cursorFlushInterval = null;
    }

    // Flush the final cursor synchronously so the next connection resumes
    // after the last event we actually observed.
    this.flushPendingCursor();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.isConnecting = false;
  }

  addDid(did: string): boolean {
    if (!did.startsWith('did:')) {
      logger.warn(`JetstreamClient: Invalid DID format: ${did}`);
      return false;
    }

    if (this.watchedDids.size >= MAX_DIDS_PER_CONNECTION) {
      logger.warn(`JetstreamClient: Maximum DIDs reached (${MAX_DIDS_PER_CONNECTION})`);
      return false;
    }

    const added = !this.watchedDids.has(did);
    this.watchedDids.add(did);

    if (added) {
      logger.debug(`JetstreamClient: Added DID ${did} (total: ${this.watchedDids.size})`);
      this.sendOptionsUpdate();
    }

    return added;
  }

  addDids(dids: string[]): number {
    let added = 0;
    for (const did of dids) {
      if (this.addDid(did)) added++;
    }
    return added;
  }

  removeDid(did: string): boolean {
    const removed = this.watchedDids.delete(did);
    if (removed) {
      logger.debug(`JetstreamClient: Removed DID ${did} (total: ${this.watchedDids.size})`);
      this.sendOptionsUpdate();
    }
    return removed;
  }

  clearDids(): void {
    this.watchedDids.clear();
    this.sendOptionsUpdate();
    logger.debug('JetstreamClient: Cleared all watched DIDs');
  }

  getWatchedDids(): Set<string> {
    return new Set(this.watchedDids);
  }

  getCursor(): number | null {
    return this.cursor;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getStats(): {
    connected: boolean;
    watchedDids: number;
    cursor: number | null;
    reconnectAttempts: number;
    lastMessageTime: number;
  } {
    return {
      connected: this.isConnected(),
      watchedDids: this.watchedDids.size,
      cursor: this.cursor,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageTime: this.lastMessageTime,
    };
  }

  private buildConnectionUrl(): string {
    const url = new URL(this.endpoints[this.relayIdx]);

    for (const collection of this.wantedCollections) {
      url.searchParams.append('wantedCollections', collection);
    }

    const didsToAdd = Array.from(this.watchedDids).slice(0, MAX_DIDS_PER_CONNECTION);
    for (const did of didsToAdd) {
      url.searchParams.append('wantedDids', did);
    }

    if (this.cursor) {
      url.searchParams.set('cursor', String(this.cursor));
    }

    if (this.compress) {
      url.searchParams.set('compress', 'true');
    }

    return url.toString();
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.lastMessageTime = Date.now();
      logger.info(
        `JetstreamClient: Connected to ${this.endpoints[this.relayIdx]}! Watching ${this.watchedDids.size} DIDs`,
      );
      this.emit('connected');
      this.startHeartbeat();
      this.startCursorFlush();
    };

    this.ws.onmessage = (event: { data: unknown }) => {
      this.lastMessageTime = Date.now();
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event: { code: number; reason: string }) => {
      logger.info(`JetstreamClient: Disconnected (code: ${event.code}, reason: ${event.reason})`);
      this.ws = null;
      this.isConnecting = false;
      this.stopHeartbeat();
      this.stopCursorFlush();
      // Flush the last seen cursor before reconnecting so we don't replay.
      this.flushPendingCursor();
      this.emit('disconnected', event.code, event.reason || '');

      if (this.shouldReconnect) {
        // Track relay health and rotate to the next endpoint after repeated
        // failures, matching atregistrar's MAX_FAILURES_BEFORE_RELAY_SWITCH.
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.maxFailuresBeforeRelaySwitch) {
          this.relayIdx = (this.relayIdx + 1) % this.endpoints.length;
          this.consecutiveFailures = 0;
          logger.info(`JetstreamClient: switching relay to ${this.endpoints[this.relayIdx]}`);
        }
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error: unknown) => {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      logger.error('JetstreamClient: WebSocket error:', errorObj);
      this.emit('error', errorObj);
    };
  }

  private handleMessage(data: unknown): void {
    try {
      const dataStr = typeof data === 'string' ? data : String(data);
      const message = JSON.parse(dataStr) as JetstreamEvent;

      if (message.time_us) {
        this.cursor = message.time_us;
        // Track the most recent cursor for periodic flushing; persisting it
        // means a reconnect resumes from here instead of replaying history.
        this.pendingCursorFlush = message.time_us;
        this.emit('cursorUpdate', this.cursor);
      }

      switch (message.kind) {
        case 'commit':
          this.handleCommitEvent(message);
          break;
        case 'identity':
          this.emit('identity', message);
          break;
        case 'account':
          this.emit('account', message);
          break;
      }
    } catch (error) {
      logger.warn('JetstreamClient: Failed to parse message:', error);
    }
  }

  private handleCommitEvent(event: JetstreamCommitEvent): void {
    if (
      event.commit.operation !== 'create' ||
      event.commit.collection !== 'app.bsky.feed.post' ||
      !event.commit.record
    ) {
      return;
    }

    if (this.watchedDids.size > 0 && !this.watchedDids.has(event.did)) {
      return;
    }

    const postEvent: JetstreamPostEvent = {
      did: event.did,
      uri: `at://${event.did}/${event.commit.collection}/${event.commit.rkey}`,
      cid: event.commit.cid || '',
      record: event.commit.record,
      timestamp: event.time_us,
    };

    this.emit('post', postEvent);
  }

  private sendOptionsUpdate(): void {
    if (!this.ws || this.ws.readyState !== READY_STATE.OPEN) {
      return;
    }

    const optionsUpdate = {
      type: 'options_update',
      payload: {
        wantedCollections: this.wantedCollections,
        wantedDids: Array.from(this.watchedDids).slice(0, MAX_DIDS_PER_CONNECTION),
      },
    };

    try {
      this.ws.send(JSON.stringify(optionsUpdate));
      logger.debug(`JetstreamClient: Sent options update with ${this.watchedDids.size} DIDs`);
    } catch (error) {
      logger.error('JetstreamClient: Failed to send options update:', error);
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;

    if (this.maxReconnectAttempts > 0 && this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `JetstreamClient: Max reconnection attempts (${this.maxReconnectAttempts}) reached`,
      );
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.reconnectMaxDelay,
    );

    this.reconnectAttempts++;
    logger.info(
      `JetstreamClient: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.watchedDids.size === 0) {
        return;
      }

      const timeSinceLastMessage = Date.now() - this.lastMessageTime;
      if (timeSinceLastMessage > 120_000 && this.ws) {
        logger.warn('JetstreamClient: No messages received in 120s, reconnecting...');
        this.ws.close(4000, 'Heartbeat timeout');
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startCursorFlush(): void {
    if (this.cursorFlushInterval || !this.persistCursor) return;
    // Flush every 3s, matching atregistrar's CURSOR_FLUSH_INTERVAL. We only
    // persist when the cursor advanced, so steady-state load is minimal.
    this.cursorFlushInterval = setInterval(() => {
      this.flushPendingCursor();
    }, 3_000);
  }

  private stopCursorFlush(): void {
    if (this.cursorFlushInterval) {
      clearInterval(this.cursorFlushInterval);
      this.cursorFlushInterval = null;
    }
  }

  private lastFlushedCursor: number | null = null;

  private flushPendingCursor(): void {
    if (!this.persistCursor) return;
    if (this.pendingCursorFlush === null) return;
    if (this.pendingCursorFlush === this.lastFlushedCursor) return;

    const cursor = this.pendingCursorFlush;
    this.lastFlushedCursor = cursor;
    try {
      const result = this.persistCursor(cursor);
      if (result instanceof Promise) {
        result.catch((error) => logger.warn(`JetstreamClient: Failed to persist cursor:`, error));
      }
    } catch (error) {
      logger.warn(`JetstreamClient: Failed to persist cursor:`, error);
    }
  }
}

export function createJetstreamClient(
  dids?: string[],
  cursor?: number,
  persistCursor?: (cursor: number) => Promise<void> | void,
  loadCursor?: () => Promise<number | null> | number | null,
): JetstreamClient {
  return new JetstreamClient({
    wantedCollections: ['app.bsky.feed.post'],
    wantedDids: dids,
    cursor,
    requireHello: true,
    persistCursor,
    loadCursor,
  });
}
