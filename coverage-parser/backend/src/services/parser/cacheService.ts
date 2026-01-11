// ==================== 缓存服务（职责：缓存解析结果，降低API调用成本）====================

interface CacheEntry {
  result: any;
  timestamp: number;
  expiresAt: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number = 24 * 60 * 60 * 1000; // 默认24小时

  /**
   * 生成缓存键
   */
  private generateKey(clauseText: string, coverageType: string): string {
    // 使用文本内容的hash作为key（简化版，实际可以使用crypto）
    const text = `${coverageType}:${clauseText}`;
    // 简单的hash函数
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `coverage_parse_${hash}`;
  }

  /**
   * 获取缓存
   */
  get(clauseText: string, coverageType: string): any | null {
    const key = this.generateKey(clauseText, coverageType);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * 设置缓存
   */
  set(clauseText: string, coverageType: string, result: any, ttl?: number): void {
    const key = this.generateKey(clauseText, coverageType);
    const now = Date.now();
    const expiresAt = now + (ttl || this.defaultTTL);

    this.cache.set(key, {
      result,
      timestamp: now,
      expiresAt
    });

    // 定期清理过期缓存（每100次操作清理一次）
    if (this.cache.size % 100 === 0) {
      this.cleanExpired();
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; entries: number } {
    const now = Date.now();
    let validEntries = 0;
    for (const entry of this.cache.values()) {
      if (now <= entry.expiresAt) {
        validEntries++;
      }
    }
    return {
      size: this.cache.size,
      entries: validEntries
    };
  }
}

// 单例模式
export const cacheService = new CacheService();


