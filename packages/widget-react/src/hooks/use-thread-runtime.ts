/**
 * Thread runtime adapter for assistant-ui
 * Bridges thread storage with assistant-ui's ExternalStoreRuntime
 */

import { useMemo, useCallback } from "react";
import { useExternalStoreRuntime } from "@assistant-ui/react";
import type { ThreadMessage as StorageMessage } from "@onemcp/shared";
import type { UseThreadStorageResult } from "./use-thread-storage.js";

/**
 * Message format expected by assistant-ui
 */
interface AssistantUIMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
  createdAt?: Date;
}

/**
 * Convert storage messages to assistant-ui format
 */
function convertToAssistantUIMessages(messages: StorageMessage[]): AssistantUIMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: new Date(msg.createdAt),
  }));
}

/**
 * Options for the thread runtime hook
 */
export interface UseThreadRuntimeOptions {
  /** Thread storage hook result */
  threadStorage: UseThreadStorageResult;
  /** Callback when a new message should be processed by the AI */
  onNewMessage: (content: string) => Promise<void>;
  /** Whether the AI is currently generating a response */
  isRunning?: boolean;
}

/**
 * Create a runtime that integrates thread storage with assistant-ui
 */
export function useThreadRuntime(options: UseThreadRuntimeOptions) {
  const { threadStorage, onNewMessage, isRunning = false } = options;

  const messages = useMemo(() => {
    if (!threadStorage.activeThread) return [];
    return convertToAssistantUIMessages(threadStorage.activeThread.messages);
  }, [threadStorage.activeThread]);

  const setMessages = useCallback(
    (newMessages: AssistantUIMessage[]) => {
      // This is called by assistant-ui for features like branch switching
      // For now, we don't support modifying message history directly
      console.log("[useThreadRuntime] setMessages called, not yet supported");
    },
    []
  );

  const onNew = useCallback(
    async (message: { content: Array<{ type: string; text?: string }> }) => {
      // Extract text content from the message parts
      const textContent = message.content
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("\n");

      if (!textContent) return;

      // Add user message to storage
      await threadStorage.addMessage({
        role: "user",
        content: textContent,
        status: "complete",
      });

      // Trigger AI processing
      await onNewMessage(textContent);
    },
    [threadStorage, onNewMessage]
  );

  // Convert our message format to assistant-ui ThreadMessage format
  const convertMessage = useCallback((message: AssistantUIMessage) => {
    return {
      id: message.id || crypto.randomUUID(),
      role: message.role,
      content: [{ type: "text" as const, text: message.content }],
      createdAt: message.createdAt || new Date(),
      status: { type: "complete" as const, reason: "stop" as const },
      metadata: {
        unstable_state: null,
        unstable_annotations: [],
        unstable_data: [],
        steps: [],
        custom: {},
      },
    };
  }, []);

  const runtime = useExternalStoreRuntime({
    messages,
    setMessages: setMessages as any,
    isRunning,
    onNew: onNew as any,
    convertMessage: convertMessage as any,
  });

  return runtime;
}

/**
 * Hook to sync assistant-ui messages with thread storage
 * Use this when you want to persist messages from an existing runtime
 */
export function useThreadSync(options: {
  threadStorage: UseThreadStorageResult;
  /** Messages from the current runtime */
  runtimeMessages: Array<{ id?: string; role: string; content: string }>;
}) {
  const { threadStorage, runtimeMessages } = options;

  // Sync runtime messages to storage when they change
  const syncToStorage = useCallback(async () => {
    if (!threadStorage.activeThreadId || !threadStorage.activeThread) return;

    const existingIds = new Set(
      threadStorage.activeThread.messages.map((m) => m.id)
    );

    for (const msg of runtimeMessages) {
      if (msg.id && existingIds.has(msg.id)) continue;

      // New message, add to storage
      await threadStorage.addMessage({
        role: msg.role as "user" | "assistant",
        content: msg.content,
        status: "complete",
      });
    }
  }, [threadStorage, runtimeMessages]);

  return { syncToStorage };
}
