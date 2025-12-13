/**
 * Thread and message types for conversation persistence
 */

/**
 * Thread message role
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Message status
 */
export type MessageStatus = "pending" | "streaming" | "complete" | "error";

/**
 * Tool call within a message
 */
export interface ThreadToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "complete" | "error";
}

/**
 * Message in a thread
 */
export interface ThreadMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  toolCalls?: ThreadToolCall[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Thread status
 */
export type ThreadStatus = "regular" | "archived" | "deleted";

/**
 * Thread (conversation)
 */
export interface Thread {
  id: string;
  title?: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Thread with messages (for full thread retrieval)
 */
export interface ThreadWithMessages extends Thread {
  messages: ThreadMessage[];
}

/**
 * Thread list item (summary without messages)
 */
export interface ThreadListItem {
  id: string;
  title?: string;
  status: ThreadStatus;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string;
  messageCount: number;
}

/**
 * Thread storage interface - implement this for custom backends
 */
export interface IThreadStorage {
  // Thread operations
  createThread(title?: string): Promise<Thread>;
  getThread(threadId: string): Promise<Thread | null>;
  updateThread(threadId: string, updates: Partial<Pick<Thread, "title" | "status" | "metadata">>): Promise<Thread>;
  deleteThread(threadId: string): Promise<void>;
  listThreads(filter?: { status?: ThreadStatus }): Promise<ThreadListItem[]>;

  // Message operations
  addMessage(threadId: string, message: Omit<ThreadMessage, "id" | "threadId" | "createdAt" | "updatedAt">): Promise<ThreadMessage>;
  updateMessage(threadId: string, messageId: string, updates: Partial<Pick<ThreadMessage, "content" | "status" | "toolCalls" | "metadata">>): Promise<ThreadMessage>;
  getMessages(threadId: string): Promise<ThreadMessage[]>;
  deleteMessage(threadId: string, messageId: string): Promise<void>;

  // Bulk operations
  getThreadWithMessages(threadId: string): Promise<ThreadWithMessages | null>;
  clearAllThreads(): Promise<void>;
}
