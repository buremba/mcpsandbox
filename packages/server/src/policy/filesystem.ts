/**
 * Filesystem policy enforcement (spec §9)
 */

import { resolve, relative } from "node:path";
import type { FilesystemPolicy } from "@onemcp/shared";

export class FilesystemPolicyEnforcer {
  constructor(private policy: FilesystemPolicy) {}

  /**
   * Check if path can be read
   */
  canRead(path: string): { allowed: boolean; reason?: string } {
    const normalized = this.normalizePath(path);

    // Check if path escapes
    if (this.isPathEscape(normalized)) {
      return { allowed: false, reason: "Path escape detected" };
    }

    // Readable paths: readonly + writable
    const allReadable = [
      ...this.policy.readonly,
      ...this.policy.writable,
    ];

    if (!this.matchesPathList(normalized, allReadable)) {
      return { allowed: false, reason: "Path not readable" };
    }

    return { allowed: true };
  }

  /**
   * Check if path can be written
   */
  canWrite(path: string): { allowed: boolean; reason?: string } {
    const normalized = this.normalizePath(path);

    // Check if path escapes
    if (this.isPathEscape(normalized)) {
      return { allowed: false, reason: "Path escape detected" };
    }

    // Only writable paths
    if (!this.matchesPathList(normalized, this.policy.writable)) {
      return { allowed: false, reason: "Path not writable" };
    }

    return { allowed: true };
  }

  private normalizePath(path: string): string {
    // Resolve to absolute path
    return resolve("/", path);
  }

  private isPathEscape(path: string): boolean {
    // Check if path tries to escape VFS root
    const rel = relative("/", path);
    return rel.startsWith("..") || resolve("/", path) !== path;
  }

  private matchesPathList(path: string, list: string[]): boolean {
    for (const allowed of list) {
      const normalizedAllowed = resolve("/", allowed);

      // Exact match or subdirectory
      if (
        path === normalizedAllowed ||
        path.startsWith(normalizedAllowed + "/")
      ) {
        return true;
      }
    }
    return false;
  }
}
