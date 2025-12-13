/**
 * Thread storage factory
 * Automatically selects the best available storage
 */

import type { IThreadStorage } from "@onemcp/shared";
import { MemoryThreadStorage } from "./memory-storage.js";
import { LocalStorageThreadStorage } from "./local-storage.js";
import { IndexedDBThreadStorage } from "./indexeddb-storage.js";
import { RemoteThreadStorage } from "./remote-storage.js";

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  if (typeof indexedDB === "undefined") return false;

  // Some browsers have indexedDB but it doesn't work (e.g., private browsing)
  try {
    const testKey = "__idb_test__";
    const request = indexedDB.open(testKey);
    request.onerror = () => {};
    request.onsuccess = () => {
      indexedDB.deleteDatabase(testKey);
    };
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable(): boolean {
  if (typeof localStorage === "undefined") return false;

  try {
    const testKey = "__ls_test__";
    localStorage.setItem(testKey, "test");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a relay server endpoint is reachable
 */
async function checkRelayServerAvailable(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/threads`, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok || response.status === 405; // 405 = method not allowed but endpoint exists
  } catch {
    return false;
  }
}

export interface AutoStorageOptions {
  /** Relay server endpoint to check for remote storage */
  relayEndpoint?: string;
  /** Key prefix for local storage */
  keyPrefix?: string;
}

/**
 * Automatically create the best available thread storage
 * Priority: Remote (if relay connected) > IndexedDB > localStorage > Memory
 */
export async function createAutoThreadStorage(
  options: AutoStorageOptions = {}
): Promise<IThreadStorage> {
  const { relayEndpoint, keyPrefix = "onemcp" } = options;

  // 1. Try remote storage if relay endpoint is provided
  if (relayEndpoint) {
    const isAvailable = await checkRelayServerAvailable(relayEndpoint);
    if (isAvailable) {
      console.log("[ThreadStorage] Using remote storage via relay server");
      return new RemoteThreadStorage({ endpoint: relayEndpoint });
    }
  }

  // 2. Try IndexedDB
  if (isIndexedDBAvailable()) {
    try {
      const idb = new IndexedDBThreadStorage(`${keyPrefix}_threads`);
      // Test that it works
      await idb.listThreads();
      console.log("[ThreadStorage] Using IndexedDB storage");
      return idb;
    } catch (e) {
      console.warn("[ThreadStorage] IndexedDB failed, trying localStorage:", e);
    }
  }

  // 3. Try localStorage
  if (isLocalStorageAvailable()) {
    console.log("[ThreadStorage] Using localStorage storage");
    return new LocalStorageThreadStorage(keyPrefix);
  }

  // 4. Fall back to memory (no persistence)
  console.warn("[ThreadStorage] No persistent storage available, using memory");
  return new MemoryThreadStorage();
}

/**
 * Check storage availability in the current environment
 */
export function checkStorageAvailability(): {
  indexedDB: boolean;
  localStorage: boolean;
} {
  return {
    indexedDB: isIndexedDBAvailable(),
    localStorage: isLocalStorageAvailable(),
  };
}
