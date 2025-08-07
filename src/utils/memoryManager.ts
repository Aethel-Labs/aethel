import logger from './logger';
interface MemoryManagerOptions {
  maxSize?: number;
  cleanupInterval?: number;
  maxAge?: number;
}

class MemoryManager<K, V> {
  private map = new Map<K, V & { timestamp: number }>();
  private maxSize: number;
  private maxAge: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: MemoryManagerOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.maxAge = options.maxAge || 24 * 60 * 60 * 1000;

    if (options.cleanupInterval) {
      this.startCleanupTimer(options.cleanupInterval);
    }
  }

  set(key: K, value: V): void {
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    const wrappedValue = Array.isArray(value)
      ? Object.assign([...value], { timestamp: Date.now() })
      : { ...value, timestamp: Date.now() };
    this.map.set(key, wrappedValue as V & { timestamp: number });
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.map.delete(key);
      return undefined;
    }

    if (Array.isArray(entry)) {
      const result = [...entry];
      delete (result as unknown as Record<string, unknown>).timestamp;
      return result as V;
    } else {
      const { timestamp: _timestamp, ...valueWithoutTimestamp } = entry;
      return valueWithoutTimestamp as V;
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.map.delete(key);
      return false;
    }

    return true;
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }

  entries(): IterableIterator<[K, V]> {
    const entries: [K, V][] = [];
    for (const [key, value] of this.map.entries()) {
      if (Date.now() - value.timestamp <= this.maxAge) {
        if (Array.isArray(value)) {
          const result = [...value];
          delete (result as unknown as Record<string, unknown>).timestamp;
          entries.push([key, result as V]);
        } else {
          const { timestamp: _timestamp, ...valueWithoutTimestamp } = value;
          entries.push([key, valueWithoutTimestamp as V]);
        }
      }
    }
    return entries[Symbol.iterator]();
  }

  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, value] of this.map.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.map.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug(`Memory cleanup: removed ${removedCount} expired entries`);
    }

    return removedCount;
  }

  private startCleanupTimer(interval: number): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, interval);
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

export function createMemoryManager<K, V>(options?: MemoryManagerOptions): MemoryManager<K, V> {
  return new MemoryManager<K, V>(options);
}

export { MemoryManager };
