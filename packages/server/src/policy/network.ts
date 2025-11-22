/**
 * Network policy enforcement (spec §9)
 */

import { parse as parseDomain } from "tldts";
import * as ipaddr from "ipaddr.js";
import type { NetworkPolicy } from "@onemcp/shared";

export class NetworkPolicyEnforcer {
  constructor(private policy: NetworkPolicy) {}

  /**
   * Check if URL is allowed by policy
   */
  canFetch(url: string): { allowed: boolean; reason?: string } {
    try {
      const parsed = new URL(url);

      // Only http/https allowed
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { allowed: false, reason: "Only HTTP/HTTPS allowed" };
      }

      // Check IP literals (spec §9)
      if (this.policy.denyIpLiterals && this.isIpLiteral(parsed.hostname)) {
        return { allowed: false, reason: "IP literal URLs denied" };
      }

      // Check denied domains (deny beats allow)
      if (this.matchesDomainList(parsed.hostname, this.policy.deniedDomains)) {
        return { allowed: false, reason: "Domain denied by policy" };
      }

      // Check allowed domains
      if (
        !this.matchesDomainList(parsed.hostname, this.policy.allowedDomains)
      ) {
        return { allowed: false, reason: "Domain not in allowlist" };
      }

      return { allowed: true };
    } catch (error) {
      return { allowed: false, reason: "Invalid URL" };
    }
  }

  private isIpLiteral(hostname: string): boolean {
    try {
      ipaddr.parse(hostname);
      return true;
    } catch {
      return false;
    }
  }

  private matchesDomainList(hostname: string, list: string[]): boolean {
    const parsed = parseDomain(hostname);
    if (!parsed.domain) return false;

    for (const pattern of list) {
      // Wildcard support: *.example.com
      if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(2);
        if (hostname.endsWith(suffix) || hostname === suffix) {
          return true;
        }
      }
      // Exact match
      else if (hostname === pattern || parsed.domain === pattern) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate response size
   */
  validateResponseSize(size: number): boolean {
    return size <= this.policy.maxBodyBytes;
  }

  /**
   * Get max allowed redirects
   */
  get maxRedirects(): number {
    return this.policy.maxRedirects;
  }

  get maxBodyBytes(): number {
    return this.policy.maxBodyBytes;
  }
}
