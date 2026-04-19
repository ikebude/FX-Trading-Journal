/**
 * T1.9: Per-Trade Metrics Cache
 *
 * Caches per-trade metrics keyed by (trade_id, version) to enable incremental
 * dashboard compute. When trades don't change, their cached metrics are reused
 * instead of being recomputed on every dashboard call.
 *
 * Version key is the trade's `updated_at` timestamp. When a trade is edited,
 * its version changes and the cache entry becomes stale.
 */

interface PerTradeMetrics {
  tradeId: string;
  version: string; // trade.updated_at timestamp
  cacheTime: number; // Date.now() when cached
  metrics: {
    rMultiple: number | null;
    pnl: number | null;
    pnlPercent: number | null;
    maePercent: number | null;
    mfePercent: number | null;
    holdingTimeSeconds: number | null;
  };
}

/**
 * LRU cache with a max size to prevent unbounded memory growth.
 * Trades are typically edited, not created indefinitely, so this is safe.
 */
class MetricsCache {
  private cache = new Map<string, PerTradeMetrics>();
  private readonly maxSize = 50_000; // ~50k trades max

  private cacheKey(tradeId: string, version: string): string {
    return `${tradeId}:${version}`;
  }

  /**
   * Try to retrieve cached metrics for a trade.
   *
   * @param tradeId - Trade ID
   * @param version - Trade's `updated_at` timestamp
   * @returns Cached metrics, or null if not in cache or stale
   */
  get(tradeId: string, version: string): PerTradeMetrics['metrics'] | null {
    const key = this.cacheKey(tradeId, version);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Return the cached metrics
    return entry.metrics;
  }

  /**
   * Store computed metrics for a trade.
   *
   * @param tradeId - Trade ID
   * @param version - Trade's `updated_at` timestamp
   * @param metrics - Pre-computed per-trade metrics
   */
  set(tradeId: string, version: string, metrics: PerTradeMetrics['metrics']): void {
    // If cache is full, evict oldest entry (simple FIFO, not LRU)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const key = this.cacheKey(tradeId, version);
    this.cache.set(key, {
      tradeId,
      version,
      cacheTime: Date.now(),
      metrics,
    });
  }

  /**
   * Invalidate all cache entries for a specific trade.
   * Called when a trade is edited or deleted.
   */
  invalidateTradeAll(tradeId: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(tradeId + ':')) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the entire cache.
   * Called when bulk trades are imported or major operations occur.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats for diagnostics.
   */
  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      isFull: this.cache.size >= this.maxSize,
    };
  }
}

// Singleton instance
const metricsCache = new MetricsCache();

export {
  metricsCache,
  type PerTradeMetrics,
};
