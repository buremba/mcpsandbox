/**
 * Rate Limiter Service
 *
 * SQLite-based rate limiting that works across:
 * - Cloudflare D1
 * - better-sqlite3 (Node.js)
 * - sql.js (Browser)
 *
 * Features:
 * - Per-user rate limits (tokens, requests)
 * - Per-minute and per-day windows
 * - Developer-scoped namespacing
 */

import type { DatabaseAdapter } from "../db/interface.js";
import type { RateLimitConfig } from "./token-manager.js";

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Current usage stats */
  usage: {
    tokensUsedToday: number;
    requestsToday: number;
    requestsThisMinute: number;
  };
  /** Rate limit configuration */
  limits: RateLimitConfig;
  /** When limits reset */
  resetAt: {
    minute: number;
    day: number;
  };
  /** Headers to include in response */
  headers: Record<string, string>;
}

/**
 * Usage record from database
 */
interface UsageRecord {
  developer_id: string;
  user_id: string;
  tokens_used_today: number;
  requests_today: number;
  requests_this_minute: number;
  day_reset_at: number;
  minute_reset_at: number;
}

/**
 * Rate Limiter Service
 */
export class RateLimiter {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Check if a request is allowed and update usage
   * @param developerId Developer namespace
   * @param userId User identifier
   * @param limits Rate limit configuration
   * @param tokensToUse Number of tokens this request will use (estimate)
   */
  async checkAndUpdate(
    developerId: string,
    userId: string,
    limits: RateLimitConfig,
    tokensToUse: number = 0
  ): Promise<RateLimitResult> {
    const now = Date.now();

    // Get or create usage record
    let usage = await this.getUsage(developerId, userId);

    if (!usage) {
      // Create new record
      usage = {
        developer_id: developerId,
        user_id: userId,
        tokens_used_today: 0,
        requests_today: 0,
        requests_this_minute: 0,
        day_reset_at: this.getNextDayReset(now),
        minute_reset_at: this.getNextMinuteReset(now),
      };
      await this.createUsage(usage);
    }

    // Check if windows need to be reset
    if (now >= usage.day_reset_at) {
      usage.tokens_used_today = 0;
      usage.requests_today = 0;
      usage.day_reset_at = this.getNextDayReset(now);
    }

    if (now >= usage.minute_reset_at) {
      usage.requests_this_minute = 0;
      usage.minute_reset_at = this.getNextMinuteReset(now);
    }

    // Check rate limits
    const result: RateLimitResult = {
      allowed: true,
      usage: {
        tokensUsedToday: usage.tokens_used_today,
        requestsToday: usage.requests_today,
        requestsThisMinute: usage.requests_this_minute,
      },
      limits,
      resetAt: {
        minute: usage.minute_reset_at,
        day: usage.day_reset_at,
      },
      headers: {},
    };

    // Check tokens per request
    if (tokensToUse > limits.maxTokensPerRequest) {
      result.allowed = false;
      result.reason = `Request exceeds max tokens per request (${tokensToUse} > ${limits.maxTokensPerRequest})`;
    }

    // Check tokens per day
    if (usage.tokens_used_today + tokensToUse > limits.maxTokensPerDay) {
      result.allowed = false;
      result.reason = `Daily token limit exceeded (${usage.tokens_used_today} + ${tokensToUse} > ${limits.maxTokensPerDay})`;
    }

    // Check requests per minute
    if (usage.requests_this_minute >= limits.maxRequestsPerMinute) {
      result.allowed = false;
      result.reason = `Minute request limit exceeded (${usage.requests_this_minute} >= ${limits.maxRequestsPerMinute})`;
    }

    // Check requests per day
    if (usage.requests_today >= limits.maxRequestsPerDay) {
      result.allowed = false;
      result.reason = `Daily request limit exceeded (${usage.requests_today} >= ${limits.maxRequestsPerDay})`;
    }

    // Update usage if allowed
    if (result.allowed) {
      usage.tokens_used_today += tokensToUse;
      usage.requests_today += 1;
      usage.requests_this_minute += 1;

      await this.updateUsage(usage);

      // Update result with new values
      result.usage = {
        tokensUsedToday: usage.tokens_used_today,
        requestsToday: usage.requests_today,
        requestsThisMinute: usage.requests_this_minute,
      };
    }

    // Build rate limit headers
    result.headers = {
      "X-RateLimit-Limit-Requests-Day": String(limits.maxRequestsPerDay),
      "X-RateLimit-Remaining-Requests-Day": String(
        Math.max(0, limits.maxRequestsPerDay - usage.requests_today)
      ),
      "X-RateLimit-Reset-Day": String(Math.ceil(usage.day_reset_at / 1000)),
      "X-RateLimit-Limit-Requests-Minute": String(limits.maxRequestsPerMinute),
      "X-RateLimit-Remaining-Requests-Minute": String(
        Math.max(0, limits.maxRequestsPerMinute - usage.requests_this_minute)
      ),
      "X-RateLimit-Reset-Minute": String(Math.ceil(usage.minute_reset_at / 1000)),
      "X-RateLimit-Limit-Tokens-Day": String(limits.maxTokensPerDay),
      "X-RateLimit-Remaining-Tokens-Day": String(
        Math.max(0, limits.maxTokensPerDay - usage.tokens_used_today)
      ),
    };

    if (!result.allowed) {
      result.headers["Retry-After"] = String(
        Math.ceil((usage.minute_reset_at - now) / 1000)
      );
    }

    return result;
  }

  /**
   * Record token usage after a request completes
   * Used when we don't know the exact token count upfront
   */
  async recordTokenUsage(
    developerId: string,
    userId: string,
    tokensUsed: number
  ): Promise<void> {
    const now = Date.now();
    let usage = await this.getUsage(developerId, userId);

    if (!usage) {
      return; // No record to update
    }

    // Check if day window needs reset
    if (now >= usage.day_reset_at) {
      usage.tokens_used_today = tokensUsed;
      usage.day_reset_at = this.getNextDayReset(now);
    } else {
      usage.tokens_used_today += tokensUsed;
    }

    await this.updateUsage(usage);
  }

  /**
   * Get usage for a user
   */
  async getUsage(developerId: string, userId: string): Promise<UsageRecord | null> {
    const result = await this.db.queryOne<UsageRecord>(
      `SELECT * FROM rate_limits WHERE developer_id = ? AND user_id = ?`,
      [developerId, userId]
    );
    return result;
  }

  /**
   * Create usage record
   */
  private async createUsage(usage: UsageRecord): Promise<void> {
    await this.db.exec(
      `INSERT INTO rate_limits
        (developer_id, user_id, tokens_used_today, requests_today, requests_this_minute, day_reset_at, minute_reset_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        usage.developer_id,
        usage.user_id,
        usage.tokens_used_today,
        usage.requests_today,
        usage.requests_this_minute,
        usage.day_reset_at,
        usage.minute_reset_at,
      ]
    );
  }

  /**
   * Update usage record
   */
  private async updateUsage(usage: UsageRecord): Promise<void> {
    await this.db.exec(
      `UPDATE rate_limits SET
        tokens_used_today = ?,
        requests_today = ?,
        requests_this_minute = ?,
        day_reset_at = ?,
        minute_reset_at = ?
       WHERE developer_id = ? AND user_id = ?`,
      [
        usage.tokens_used_today,
        usage.requests_today,
        usage.requests_this_minute,
        usage.day_reset_at,
        usage.minute_reset_at,
        usage.developer_id,
        usage.user_id,
      ]
    );
  }

  /**
   * Get next day reset timestamp (midnight UTC)
   */
  private getNextDayReset(now: number): number {
    const date = new Date(now);
    date.setUTCHours(24, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Get next minute reset timestamp
   */
  private getNextMinuteReset(now: number): number {
    return now + 60 * 1000;
  }

  /**
   * Clean up old records
   */
  async cleanup(maxAgeDays: number = 7): Promise<number> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const result = await this.db.exec(
      `DELETE FROM rate_limits WHERE day_reset_at < ?`,
      [cutoff]
    );

    return result.rowsAffected;
  }

  /**
   * Reset usage for a specific user
   */
  async resetUsage(developerId: string, userId: string): Promise<void> {
    const now = Date.now();

    await this.db.exec(
      `UPDATE rate_limits SET
        tokens_used_today = 0,
        requests_today = 0,
        requests_this_minute = 0,
        day_reset_at = ?,
        minute_reset_at = ?
       WHERE developer_id = ? AND user_id = ?`,
      [
        this.getNextDayReset(now),
        this.getNextMinuteReset(now),
        developerId,
        userId,
      ]
    );
  }
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(db: DatabaseAdapter): RateLimiter {
  return new RateLimiter(db);
}
