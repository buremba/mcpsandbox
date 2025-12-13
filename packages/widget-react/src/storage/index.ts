/**
 * Thread storage module
 * Storage backend is automatically selected based on availability:
 * - Remote (if relay server connected)
 * - IndexedDB (if available)
 * - localStorage (fallback)
 * - Memory (last resort)
 */

// Internal implementations (used by factory, not exported to public API)
export { MemoryThreadStorage } from "./memory-storage.js";
export { LocalStorageThreadStorage } from "./local-storage.js";
export { IndexedDBThreadStorage } from "./indexeddb-storage.js";
export { RemoteThreadStorage } from "./remote-storage.js";

// Internal API (used by hooks)
export { createAutoThreadStorage, type AutoStorageOptions } from "./factory.js";

// Re-export types from shared (for internal use)
export type {
  IThreadStorage,
  Thread,
  ThreadMessage,
  ThreadListItem,
  ThreadWithMessages,
  ThreadStatus,
} from "@onemcp/shared";
