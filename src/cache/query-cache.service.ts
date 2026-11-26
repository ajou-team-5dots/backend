import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { deepFreeze } from '../common/deep-freeze.js';
import type { Env } from '../config/env.schema.js';

/**
 * Upper bound on remembered results. Keys come from validated query values (monster id, filters,
 * flow picks), so a few thousand covers every screen; the cap only stops unbounded growth.
 */
export const MAX_CACHE_ENTRIES = 5_000;

/**
 * A load still running after this long is treated as stuck: the next call starts a fresh one
 * instead of waiting on it forever. Well above CLICKHOUSE_REQUEST_TIMEOUT_MS (10 s by default).
 */
export const MAX_PENDING_MS = 30_000;

/** One key element. Objects are not allowed: their serialization depends on property order. */
export type CacheKeyPart = string | number | boolean | bigint | null | undefined;

interface Entry {
  startedAt: number;
  /** Set once the load succeeded; until then the entry is pending. */
  expiresAt?: number;
  value: Promise<unknown>;
}

/** A finished entry lives for the TTL; a pending one until it has run MAX_PENDING_MS. */
const isFresh = (entry: Entry, now: number): boolean =>
  entry.expiresAt === undefined ? now - entry.startedAt < MAX_PENDING_MS : entry.expiresAt > now;

/**
 * Turns a key into a Map id. Each part carries its type, so values that JSON.stringify would merge
 * stay apart: undefined vs null (both "null"), NaN vs null, 1 vs '1', and bigint (which
 * JSON.stringify cannot serialize at all).
 */
const keyId = (key: readonly CacheKeyPart[]): string =>
  JSON.stringify(
    key.map((part): string => {
      if (part === null) {
        return 'null';
      }
      switch (typeof part) {
        case 'undefined':
          return 'undefined';
        case 'string':
          return `s:${part}`;
        case 'number':
          // String() keeps NaN and Infinity apart from null; -0 and 0 are the same key.
          return `n:${String(part)}`;
        case 'boolean':
          return `b:${String(part)}`;
        case 'bigint':
          return `i:${part.toString()}`;
        default:
          throw new TypeError(`캐시 키에는 문자열, 숫자, 불리언만 쓸 수 있습니다 (${typeof part})`);
      }
    }),
  );

/**
 * Replaces front-demo's `'use cache'` + `cacheLife('hours')`: remembers each result in process
 * memory for CACHE_TTL_MS after it finished loading. Calls that arrive while the same key is still
 * loading share that one promise (for up to MAX_PENDING_MS), so `Promise.all` over functions that need the same aggregate
 * sends one query, not several. Failures are not remembered. Results are deep-frozen: every
 * request gets the same object, so copy before changing it. When full, expired entries go first,
 * then the least recently used. Everything is dropped at once by `clear()` after a load or batch
 * run (front-demo also cleared both of its tags together).
 */
@Injectable()
export class QueryCacheService {
  /** Map order is recency order: a hit moves its entry to the end. */
  private readonly entries = new Map<string, Entry>();

  private readonly ttlMs: number;

  constructor(config: ConfigService<Env, true>) {
    this.ttlMs = config.get('CACHE_TTL_MS', { infer: true });
  }

  /**
   * Returns the remembered result for `key`, or runs `load` and remembers it.
   * Start the key with the function name, e.g. `['monster-counts', heavy, period]`: one key must
   * always hold the same type. Never throws synchronously; a bad key or a throwing `load` rejects.
   */
  wrap<T>(key: readonly CacheKeyPart[], load: () => Promise<T>): Promise<T> {
    let id: string;
    try {
      id = keyId(key);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    const now = Date.now();
    const hit = this.entries.get(id);
    if (hit && isFresh(hit, now)) {
      this.entries.delete(id);
      this.entries.set(id, hit);
      // Safe: the key starts with the caller's name, and that caller always stores a T.
      return hit.value as Promise<T>;
    }

    this.entries.delete(id);
    const entry: Entry = { startedAt: now, value: Promise.resolve() };
    const value = Promise.resolve()
      .then(load)
      .then((result) => {
        // Freeze first: if freezing throws, the entry must not count as loaded.
        const frozen = deepFreeze(result);
        entry.expiresAt = Date.now() + this.ttlMs;
        return frozen;
      })
      .catch((error: unknown) => {
        // Only drop our own entry: clear() and a later reload may already have replaced it.
        if (this.entries.get(id) === entry) {
          this.entries.delete(id);
        }
        throw error;
      });
    entry.value = value;
    this.entries.set(id, entry);
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
    if (this.entries.size <= MAX_CACHE_ENTRIES) {
      return;
    }
    const now = Date.now();
    this.entries.forEach((entry, id) => {
      if (!isFresh(entry, now)) {
        this.entries.delete(id);
      }
    });
    const overflow = this.entries.size - MAX_CACHE_ENTRIES;
    [...this.entries.keys()].slice(0, Math.max(overflow, 0)).forEach((id) => {
      this.entries.delete(id);
    });
  }
}
