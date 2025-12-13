/**
 * Remote API-based thread storage implementation
 * Communicates with a backend server for persistence
 * Compatible with assistant-ui backend API patterns
 */

import type {
  IThreadStorage,
  Thread,
  ThreadMessage,
  ThreadListItem,
  ThreadWithMessages,
  ThreadStatus,
} from "@onemcp/shared";

export interface RemoteStorageConfig {
  /** Base URL for the API endpoint */
  endpoint: string;
  /** Optional API key for authentication */
  apiKey?: string;
  /** Optional custom headers */
  headers?: Record<string, string>;
}

export class RemoteThreadStorage implements IThreadStorage {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(config: RemoteStorageConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, ""); // Remove trailing slash
    this.headers = {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...config.headers,
    };
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.endpoint}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`API error (${response.status}): ${error}`);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return undefined as T;

    return JSON.parse(text) as T;
  }

  async createThread(title?: string): Promise<Thread> {
    return this.fetch<Thread>("/threads", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async getThread(threadId: string): Promise<Thread | null> {
    try {
      return await this.fetch<Thread>(`/threads/${threadId}`);
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) {
        return null;
      }
      throw e;
    }
  }

  async updateThread(
    threadId: string,
    updates: Partial<Pick<Thread, "title" | "status" | "metadata">>
  ): Promise<Thread> {
    return this.fetch<Thread>(`/threads/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.fetch<void>(`/threads/${threadId}`, {
      method: "DELETE",
    });
  }

  async listThreads(filter?: { status?: ThreadStatus }): Promise<ThreadListItem[]> {
    const params = new URLSearchParams();
    if (filter?.status) {
      params.set("status", filter.status);
    }
    const query = params.toString();
    return this.fetch<ThreadListItem[]>(`/threads${query ? `?${query}` : ""}`);
  }

  async addMessage(
    threadId: string,
    message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">
  ): Promise<ThreadMessage> {
    return this.fetch<ThreadMessage>(`/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls" | "metadata">>
  ): Promise<ThreadMessage> {
    return this.fetch<ThreadMessage>(`/threads/${threadId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
  }

  async getMessages(threadId: string): Promise<ThreadMessage[]> {
    return this.fetch<ThreadMessage[]>(`/threads/${threadId}/messages`);
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    await this.fetch<void>(`/threads/${threadId}/messages/${messageId}`, {
      method: "DELETE",
    });
  }

  async getThreadWithMessages(threadId: string): Promise<ThreadWithMessages | null> {
    try {
      return await this.fetch<ThreadWithMessages>(`/threads/${threadId}?include=messages`);
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) {
        return null;
      }
      throw e;
    }
  }

  async clearAllThreads(): Promise<void> {
    // This is a dangerous operation - most APIs won't support it
    // We'll list and delete each thread individually
    const threads = await this.listThreads();
    await Promise.all(threads.map((t) => this.deleteThread(t.id)));
  }
}
