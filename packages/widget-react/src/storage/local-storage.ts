/**
 * LocalStorage-based thread storage implementation
 * Persists data in browser's localStorage
 */

import type {
  IThreadStorage,
  Thread,
  ThreadMessage,
  ThreadListItem,
  ThreadWithMessages,
  ThreadStatus,
} from "@onemcp/shared";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface StorageData {
  threads: Record<string, Thread>;
  messages: Record<string, ThreadMessage[]>;
}

export class LocalStorageThreadStorage implements IThreadStorage {
  private keyPrefix: string;
  private storageKey: string;

  constructor(keyPrefix: string = "onemcp") {
    this.keyPrefix = keyPrefix;
    this.storageKey = `${keyPrefix}_threads`;
  }

  private getData(): StorageData {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error("[LocalStorageThreadStorage] Failed to parse storage data:", e);
    }
    return { threads: {}, messages: {} };
  }

  private setData(data: StorageData): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error("[LocalStorageThreadStorage] Failed to save storage data:", e);
      throw new Error("Failed to save to localStorage");
    }
  }

  async createThread(title?: string): Promise<Thread> {
    const data = this.getData();
    const now = Date.now();
    const thread: Thread = {
      id: generateId(),
      title,
      status: "regular",
      createdAt: now,
      updatedAt: now,
    };
    data.threads[thread.id] = thread;
    data.messages[thread.id] = [];
    this.setData(data);
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const data = this.getData();
    return data.threads[threadId] ?? null;
  }

  async updateThread(
    threadId: string,
    updates: Partial<Pick<Thread, "title" | "status" | "metadata">>
  ): Promise<Thread> {
    const data = this.getData();
    const thread = data.threads[threadId];
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    const updated: Thread = {
      ...thread,
      ...updates,
      updatedAt: Date.now(),
    };
    data.threads[threadId] = updated;
    this.setData(data);
    return updated;
  }

  async deleteThread(threadId: string): Promise<void> {
    const data = this.getData();
    delete data.threads[threadId];
    delete data.messages[threadId];
    this.setData(data);
  }

  async listThreads(filter?: { status?: ThreadStatus }): Promise<ThreadListItem[]> {
    const data = this.getData();
    const items: ThreadListItem[] = [];

    for (const thread of Object.values(data.threads)) {
      if (filter?.status && thread.status !== filter.status) {
        continue;
      }

      const threadMessages = data.messages[thread.id] || [];
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

    // Sort by updatedAt descending
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async addMessage(
    threadId: string,
    message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">
  ): Promise<ThreadMessage> {
    const data = this.getData();
    const thread = data.threads[threadId];
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

    if (!data.messages[threadId]) {
      data.messages[threadId] = [];
    }
    data.messages[threadId].push(newMessage);

    // Update thread's updatedAt
    thread.updatedAt = now;
    data.threads[threadId] = thread;

    this.setData(data);
    return newMessage;
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls" | "metadata">>
  ): Promise<ThreadMessage> {
    const data = this.getData();
    const threadMessages = data.messages[threadId];
    if (!threadMessages) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    const index = threadMessages.findIndex((m) => m.id === messageId);
    if (index === -1) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const updated: ThreadMessage = {
      ...threadMessages[index],
      ...updates,
      updatedAt: Date.now(),
    };
    threadMessages[index] = updated;
    data.messages[threadId] = threadMessages;
    this.setData(data);

    return updated;
  }

  async getMessages(threadId: string): Promise<ThreadMessage[]> {
    const data = this.getData();
    return data.messages[threadId] || [];
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    const data = this.getData();
    const threadMessages = data.messages[threadId];
    if (!threadMessages) return;

    const index = threadMessages.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      threadMessages.splice(index, 1);
      data.messages[threadId] = threadMessages;
      this.setData(data);
    }
  }

  async getThreadWithMessages(threadId: string): Promise<ThreadWithMessages | null> {
    const data = this.getData();
    const thread = data.threads[threadId];
    if (!thread) return null;

    return {
      ...thread,
      messages: data.messages[threadId] || [],
    };
  }

  async clearAllThreads(): Promise<void> {
    this.setData({ threads: {}, messages: {} });
  }
}
