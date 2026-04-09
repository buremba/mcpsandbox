/**
 * Thread storage service for the relay server
 * Provides pluggable backend support for thread persistence
 */

import type {
  IThreadStorage,
  Thread,
  ThreadMessage,
  ThreadListItem,
  ThreadWithMessages,
  ThreadStatus,
} from "@onemcp/shared";
import type { Logger } from "pino";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * In-memory thread storage (default for server)
 * Data persists only while server is running
 */
export class ServerMemoryThreadStorage implements IThreadStorage {
  private threads: Map<string, Thread> = new Map();
  private messages: Map<string, ThreadMessage[]> = new Map();

  constructor(private logger?: Logger) {}

  async createThread(title?: string): Promise<Thread> {
    const now = Date.now();
    const thread: Thread = {
      id: generateId(),
      title,
      status: "regular",
      createdAt: now,
      updatedAt: now,
    };
    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);
    this.logger?.debug({ threadId: thread.id }, "Created thread");
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async updateThread(
    threadId: string,
    updates: Partial<Pick<Thread, "title" | "status" | "metadata">>
  ): Promise<Thread> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    const updated: Thread = {
      ...thread,
      ...updates,
      updatedAt: Date.now(),
    };
    this.threads.set(threadId, updated);
    return updated;
  }

  async deleteThread(threadId: string): Promise<void> {
    this.threads.delete(threadId);
    this.messages.delete(threadId);
    this.logger?.debug({ threadId }, "Deleted thread");
  }

  async listThreads(filter?: { status?: ThreadStatus }): Promise<ThreadListItem[]> {
    const items: ThreadListItem[] = [];

    for (const thread of this.threads.values()) {
      if (filter?.status && thread.status !== filter.status) {
        continue;
      }

      const threadMessages = this.messages.get(thread.id) || [];
      const lastMessage = threadMessages[threadMessages.length - 1];

      items.push({
        id: thread.id,
        title: thread.title,
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessagePreview: lastMessage?.content?.slice(0, 100),
        messageCount: threadMessages.length,
      });
    }

    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async addMessage(
    threadId: string,
    message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">
  ): Promise<ThreadMessage> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const now = Date.now();
    const newMessage: ThreadMessage = {
      ...message,
      id: generateId(),
      threadId,
      createdAt: now,
      updatedAt: now,
    };

    const threadMessages = this.messages.get(threadId) || [];
    threadMessages.push(newMessage);
    this.messages.set(threadId, threadMessages);

    thread.updatedAt = now;
    this.threads.set(threadId, thread);

    return newMessage;
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls" | "metadata">>
  ): Promise<ThreadMessage> {
    const threadMessages = this.messages.get(threadId);
    if (!threadMessages) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const index = threadMessages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const existingMessage = threadMessages[index];
    if (!existingMessage) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const updated: ThreadMessage = {
      ...existingMessage,
      ...updates,
      updatedAt: Date.now(),
    };
    threadMessages[index] = updated;
    this.messages.set(threadId, threadMessages);

    return updated;
  }

  async getMessages(threadId: string): Promise<ThreadMessage[]> {
    return this.messages.get(threadId) || [];
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    const threadMessages = this.messages.get(threadId);
    if (!threadMessages) return;

    const index = threadMessages.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      threadMessages.splice(index, 1);
      this.messages.set(threadId, threadMessages);
    }
  }

  async getThreadWithMessages(threadId: string): Promise<ThreadWithMessages | null> {
    const thread = this.threads.get(threadId);
    if (!thread) return null;

    return {
      ...thread,
      messages: this.messages.get(threadId) || [],
    };
  }

  async clearAllThreads(): Promise<void> {
    this.threads.clear();
    this.messages.clear();
    this.logger?.info("Cleared all threads");
  }
}

/**
 * Thread storage configuration for server
 */
export interface ServerThreadStorageConfig {
  /** Storage type */
  type: "memory" | "file" | "sqlite" | "custom";
  /** File path for file-based storage */
  filePath?: string;
  /** SQLite database path */
  sqlitePath?: string;
  /** Custom storage factory */
  factory?: () => IThreadStorage | Promise<IThreadStorage>;
}

/**
 * Create thread storage based on configuration
 */
export async function createServerThreadStorage(
  config?: ServerThreadStorageConfig,
  logger?: Logger
): Promise<IThreadStorage> {
  if (config?.factory) {
    return config.factory();
  }

  const type = config?.type || "memory";

  switch (type) {
    case "memory":
    default:
      return new ServerMemoryThreadStorage(logger);
  }
}
