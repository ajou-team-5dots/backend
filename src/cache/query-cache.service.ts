import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

/**
 * Upper bound on remembered results. Keys come from validated query values (monster id, filters,
 * flow picks), so a few thousand covers every screen; the cap only stops unbounded growth.
 */
export const MAX_CACHE_ENTRIES = 5_000;

interface Entry {
  expiresAt: number;
  value: Promise<unknown>;
}

/**
 * Replaces front-demo's `'use cache'` + `cacheLife('hours')`: remembers each result in process
 * memory for CACHE_TTL_MS. Calls that arrive while the same key is still loading share that one
 * promise, so `Promise.all` over functions that need the same aggregate sends one query, not
 * several. Failures are not remembered. Everything is dropped at once by `clear()` after a load
 * or batch run (front-demo also cleared both of its tags together).
 */
@Injectable()
export class QueryCacheService {
  private readonly entries = new Map<string, Entry>();

  private readonly ttlMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.ttlMs = config.get('CACHE_TTL_MS', { infer: true });
  }

  /**
   * Returns the remembered result for `key`, or runs `load` and remembers it.
   * Start the key with the function name, e.g. `['monster-counts', heavy, period]`: one key must
   * always hold the same type.
   */
  wrap<T>(key: readonly unknown[], load: () => Promise<T>): Promise<T> {
    const id = JSON.stringify(key);
    const now = Date.now();
    const hit = this.entries.get(id);
    if (hit && hit.expiresAt > now) {
      // Safe: the key starts with the caller's name, and that caller always stores a T.
      return hit.value as Promise<T>;
    }

    // Delete first so the new entry goes to the end of the Map (oldest-first eviction order).
    this.entries.delete(id);
    const value = Promise.resolve().then(load);
    const entry: Entry = { expiresAt: now + this.ttlMs, value };
    this.entries.set(id, entry);
    value.catch(() => {
      // Only drop our own entry: clear() and a later reload may already have replaced it.
      if (this.entries.get(id) === entry) {
        this.entries.delete(id);
      }
    });
    this.evictOverflow();
    return value;
  }

  /** Drops every remembered result. Returns how many there were. */
  clear(): number {
    const { size } = this.entries;
    this.entries.clear();
    return size;
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOverflow(): void {
    const overflow = this.entries.size - MAX_CACHE_ENTRIES;
    if (overflow <= 0) {
      return;
    }
    [...this.entries.keys()].slice(0, overflow).forEach((id) => {
      this.entries.delete(id);
    });
  }
}
