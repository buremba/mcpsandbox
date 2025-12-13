/**
 * Thread storage hook
 * Provides React integration for thread storage with state management
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  IThreadStorage,
  Thread,
  ThreadMessage,
  ThreadListItem,
} from "@onemcp/shared";
import { createAutoThreadStorage } from "../storage/index.js";

export interface UseThreadStorageOptions {
  /** Whether threads are enabled */
  enabled?: boolean;
  /** Relay server endpoint (for remote storage) */
  relayEndpoint?: string;
  /** Auto-refresh interval in ms (0 to disable) */
  refreshInterval?: number;
}

export interface UseThreadStorageResult {
  /** List of threads */
  threads: ThreadListItem[];
  /** Currently active thread ID */
  activeThreadId: string | null;
  /** Current thread with messages */
  activeThread: { thread: Thread; messages: ThreadMessage[] } | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;

  /** Create a new thread */
  createThread: (title?: string) => Promise<Thread>;
  /** Switch to a thread */
  switchThread: (threadId: string) => Promise<void>;
  /** Delete a thread */
  deleteThread: (threadId: string) => Promise<void>;
  /** Archive a thread */
  archiveThread: (threadId: string) => Promise<void>;
  /** Rename a thread */
  renameThread: (threadId: string, title: string) => Promise<void>;
  /** Add a message to the active thread */
  addMessage: (
    message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">
  ) => Promise<ThreadMessage | null>;
  /** Update a message */
  updateMessage: (
    messageId: string,
    updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls">>
  ) => Promise<ThreadMessage | null>;
  /** Refresh threads list */
  refreshThreads: () => Promise<void>;
  /** Clear active thread (go back to list) */
  clearActiveThread: () => void;
  /** Get the storage instance */
  getStorage: () => IThreadStorage | null;
}

export function useThreadStorage(
  options: UseThreadStorageOptions = {}
): UseThreadStorageResult {
  const { enabled = false, relayEndpoint, refreshInterval = 0 } = options;

  const [storageInstance, setStorageInstance] = useState<IThreadStorage | null>(null);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<{
    thread: Thread;
    messages: ThreadMessage[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  // Track initialization
  const initializedRef = useRef(false);

  // Initialize storage (only if enabled)
  useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      try {
        setIsLoading(true);
        const storage = await createAutoThreadStorage({ relayEndpoint });
        setStorageInstance(storage);
        const threadsList = await storage.listThreads({ status: "regular" });
        setThreads(threadsList);
        setError(null);
      } catch (err) {
        console.error("[useThreadStorage] Initialization failed:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [enabled, relayEndpoint]);

  // Auto-refresh
  useEffect(() => {
    if (!storageInstance || refreshInterval <= 0) return;

    const interval = setInterval(async () => {
      try {
        const threadsList = await storageInstance.listThreads({ status: "regular" });
        setThreads(threadsList);
      } catch (err) {
        console.error("[useThreadStorage] Refresh failed:", err);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [storageInstance, refreshInterval]);

  const refreshThreads = useCallback(async () => {
    if (!storageInstance) return;
    try {
      const threadsList = await storageInstance.listThreads({ status: "regular" });
      setThreads(threadsList);
    } catch (err) {
      console.error("[useThreadStorage] Refresh failed:", err);
    }
  }, [storageInstance]);

  const createThread = useCallback(
    async (title?: string): Promise<Thread> => {
      if (!storageInstance) {
        throw new Error("Storage not initialized");
      }
      const thread = await storageInstance.createThread(title);
      await refreshThreads();
      setActiveThreadId(thread.id);
      setActiveThread({ thread, messages: [] });
      return thread;
    },
    [storageInstance, refreshThreads]
  );

  const switchThread = useCallback(
    async (threadId: string): Promise<void> => {
      if (!storageInstance) return;
      try {
        const data = await storageInstance.getThreadWithMessages(threadId);
        if (data) {
          setActiveThreadId(threadId);
          setActiveThread({ thread: data, messages: data.messages });
        }
      } catch (err) {
        console.error("[useThreadStorage] Switch thread failed:", err);
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [storageInstance]
  );

  const deleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      if (!storageInstance) return;
      await storageInstance.deleteThread(threadId);
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setActiveThread(null);
      }
      await refreshThreads();
    },
    [storageInstance, activeThreadId, refreshThreads]
  );

  const archiveThread = useCallback(
    async (threadId: string): Promise<void> => {
      if (!storageInstance) return;
      await storageInstance.updateThread(threadId, { status: "archived" });
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setActiveThread(null);
      }
      await refreshThreads();
    },
    [storageInstance, activeThreadId, refreshThreads]
  );

  const renameThread = useCallback(
    async (threadId: string, title: string): Promise<void> => {
      if (!storageInstance) return;
      const updated = await storageInstance.updateThread(threadId, { title });
      if (activeThreadId === threadId && activeThread) {
        setActiveThread({ ...activeThread, thread: updated });
      }
      await refreshThreads();
    },
    [storageInstance, activeThreadId, activeThread, refreshThreads]
  );

  const addMessage = useCallback(
    async (
      message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">
    ): Promise<ThreadMessage | null> => {
      if (!storageInstance || !activeThreadId) return null;
      const newMessage = await storageInstance.addMessage(activeThreadId, message);
      // Update local state
      if (activeThread) {
        setActiveThread({
          ...activeThread,
          messages: [...activeThread.messages, newMessage],
        });
      }
      return newMessage;
    },
    [storageInstance, activeThreadId, activeThread]
  );

  const updateMessage = useCallback(
    async (
      messageId: string,
      updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls">>
    ): Promise<ThreadMessage | null> => {
      if (!storageInstance || !activeThreadId) return null;
      const updated = await storageInstance.updateMessage(activeThreadId, messageId, updates);
      // Update local state
      if (activeThread) {
        setActiveThread({
          ...activeThread,
          messages: activeThread.messages.map((m) =>
            m.id === messageId ? updated : m
          ),
        });
      }
      return updated;
    },
    [storageInstance, activeThreadId, activeThread]
  );

  const clearActiveThread = useCallback(() => {
    setActiveThreadId(null);
    setActiveThread(null);
  }, []);

  const getStorage = useCallback(() => storageInstance, [storageInstance]);

  return useMemo(
    () => ({
      threads,
      activeThreadId,
      activeThread,
      isLoading,
      error,
      createThread,
      switchThread,
      deleteThread,
      archiveThread,
      renameThread,
      addMessage,
      updateMessage,
      refreshThreads,
      clearActiveThread,
      getStorage,
    }),
    [
      threads,
      activeThreadId,
      activeThread,
      isLoading,
      error,
      createThread,
      switchThread,
      deleteThread,
      archiveThread,
      renameThread,
      addMessage,
      updateMessage,
      refreshThreads,
      clearActiveThread,
      getStorage,
    ]
  );
}
