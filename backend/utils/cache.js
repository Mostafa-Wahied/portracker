/**
 * Simple TTL-based in-memory cache (per-process) to reduce repeated expensive Docker / system calls.
 * Not intended for persistent correctness guarantees – purely a performance optimization layer.
 */
class SimpleTTLCache {
  constructor() {
  
  this.store = new Map();
  }

  /**
   * Get a cached entry if not expired
   * @param {string} key
   * @returns {any|undefined}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires !== 0 && Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a cached value
   * @param {string} key
   * @param {any} value
   * @param {number} ttlMs 0 or negative => no expiration
   */
  set(key, value, ttlMs) {
    const expires = ttlMs > 0 ? Date.now() + ttlMs : 0;
    this.store.set(key, { value, expires });
    return value;
  }

  /**
   * Get or populate cache
   * @param {string} key
   * @param {number} ttlMs
   * @param {Function} fetchFn async -> value
   */
  async getOrSet(key, ttlMs, fetchFn) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await fetchFn();
    if (value !== undefined) {
      this.set(key, value, ttlMs);
    }
    return value;
  }

  /** Clear single key */
  delete(key) { this.store.delete(key); }

  /** Clear entire cache */
  clear() { this.store.clear(); }
}

module.exports = { SimpleTTLCache };
