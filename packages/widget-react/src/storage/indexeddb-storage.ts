/**
 * IndexedDB-based thread storage implementation
 * Better performance than localStorage for large data
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

const DB_VERSION = 1;

export class IndexedDBThreadStorage implements IThreadStorage {
  private dbName: string;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(dbName: string = "onemcp_threads") {
    this.dbName = dbName;
  }

  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create threads store
        if (!db.objectStoreNames.contains("threads")) {
          const threadsStore = db.createObjectStore("threads", { keyPath: "id" });
          threadsStore.createIndex("status", "status", { unique: false });
          threadsStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        // Create messages store
        if (!db.objectStoreNames.contains("messages")) {
          const messagesStore = db.createObjectStore("messages", { keyPath: "id" });
          messagesStore.createIndex("threadId", "threadId", { unique: false });
          messagesStore.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async getStore(
    storeName: "threads" | "messages",
    mode: IDBTransactionMode = "readonly"
  ): Promise<IDBObjectStore> {
    await this.init();
    const transaction = this.db!.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  private promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async createThread(title?: string): Promise<Thread> {
    const store = await this.getStore("threads", "readwrite");
    const now = Date.now();
    const thread: Thread = {
      id: generateId(),
      title,
      status: "regular",
      createdAt: now,
      updatedAt: now,
    };
    await this.promisify(store.add(thread));
    return thread;
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const store = await this.getStore("threads");
    const result = await this.promisify(store.get(threadId));
    return result ?? null;
  }

  async updateThread(
    threadId: string,
    updates: Partial<Pick<Thread, "title" | "status" | "metadata">>
  ): Promise<Thread> {
    const store = await this.getStore("threads", "readwrite");
    const thread = await this.promisify(store.get(threadId));
    if (!thread) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    const updated: Thread = {
      ...thread,
      ...updates,
      updatedAt: Date.now(),
    };
    await this.promisify(store.put(updated));
    return updated;
  }

  async deleteThread(threadId: string): Promise<void> {
    // Delete thread
    const threadsStore = await this.getStore("threads", "readwrite");
    await this.promisify(threadsStore.delete(threadId));

    // Delete all messages for this thread
    const messagesStore = await this.getStore("messages", "readwrite");
    const index = messagesStore.index("threadId");
    const request = index.openCursor(IDBKeyRange.only(threadId));

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async listThreads(filter?: { status?: ThreadStatus }): Promise<ThreadListItem[]> {
    const threadsStore = await this.getStore("threads");
    const allThreads: Thread[] = await this.promisify(threadsStore.getAll());

    const items: ThreadListItem[] = [];

    for (const thread of allThreads) {
      if (filter?.status && thread.status !== filter.status) {
        continue;
      }

      const messages = await this.getMessages(thread.id);
      const lastMessage = messages[messages.length - 1];

      items.push({
        id: thread.id,
        title: thread.title,
        status: thread.status,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        lastMessagePreview: lastMessage?.content?.slice(0, 100),
        messageCount: messages.length,
      });
    }

    // Sort by updatedAt descending
    return items.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async addMessage(
    threadId: string,
    message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">
  ): Promise<ThreadMessage> {
    // Verify thread exists
    const thread = await this.getThread(threadId);
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

    const messagesStore = await this.getStore("messages", "readwrite");
    await this.promisify(messagesStore.add(newMessage));

    // Update thread's updatedAt
    await this.updateThread(threadId, {});

    return newMessage;
  }

  async updateMessage(
    threadId: string,
    messageId: string,
    updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls" | "metadata">>
  ): Promise<ThreadMessage> {
    const store = await this.getStore("messages", "readwrite");
    const message = await this.promisify(store.get(messageId));
    if (!message || message.threadId !== threadId) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const updated: ThreadMessage = {
      ...message,
      ...updates,
      updatedAt: Date.now(),
    };
    await this.promisify(store.put(updated));

    return updated;
  }

  async getMessages(threadId: string): Promise<ThreadMessage[]> {
    const store = await this.getStore("messages");
    const index = store.index("threadId");
    const messages: ThreadMessage[] = await this.promisify(
      index.getAll(IDBKeyRange.only(threadId))
    );
    // Sort by createdAt ascending
    return messages.sort((a, b) => a.createdAt - b.createdAt);
  }

  async deleteMessage(threadId: string, messageId: string): Promise<void> {
    const store = await this.getStore("messages", "readwrite");
    const message = await this.promisify(store.get(messageId));
    if (message && message.threadId === threadId) {
      await this.promisify(store.delete(messageId));
    }
  }

  async getThreadWithMessages(threadId: string): Promise<ThreadWithMessages | null> {
    const thread = await this.getThread(threadId);
    if (!thread) return null;

    return {
      ...thread,
      messages: await this.getMessages(threadId),
    };
  }

  async clearAllThreads(): Promise<void> {
    const threadsStore = await this.getStore("threads", "readwrite");
    const messagesStore = await this.getStore("messages", "readwrite");
    await Promise.all([
      this.promisify(threadsStore.clear()),
      this.promisify(messagesStore.clear()),
    ]);
  }
}
