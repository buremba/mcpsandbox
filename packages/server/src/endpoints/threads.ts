/**
 * Thread endpoints for the relay server
 * Provides REST API for thread management compatible with assistant-ui
 */

import type { Hono } from "hono";
import type { IThreadStorage, ThreadStatus } from "@onemcp/shared";

/**
 * Setup thread management endpoints
 */
export function setupThreadEndpoints(app: Hono, storage: IThreadStorage) {
  /**
   * List all threads
   * GET /threads?status=regular|archived
   */
  app.get("/threads", async (c) => {
    try {
      const status = c.req.query("status") as ThreadStatus | undefined;
      const threads = await storage.listThreads(status ? { status } : undefined);
      return c.json({ threads });
    } catch (error) {
      console.error("[Threads] List error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Create a new thread
   * POST /threads
   * Body: { title?: string }
   */
  app.post("/threads", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const thread = await storage.createThread(body.title);
      return c.json(thread, 201);
    } catch (error) {
      console.error("[Threads] Create error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Get a specific thread
   * GET /threads/:id
   * Query: ?include=messages
   */
  app.get("/threads/:id", async (c) => {
    try {
      const threadId = c.req.param("id");
      const include = c.req.query("include");

      if (include === "messages") {
        const thread = await storage.getThreadWithMessages(threadId);
        if (!thread) {
          return c.json({ error: "Thread not found" }, 404);
        }
        return c.json(thread);
      }

      const thread = await storage.getThread(threadId);
      if (!thread) {
        return c.json({ error: "Thread not found" }, 404);
      }
      return c.json(thread);
    } catch (error) {
      console.error("[Threads] Get error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Update a thread
   * PATCH /threads/:id
   * Body: { title?: string, status?: ThreadStatus, metadata?: object }
   */
  app.patch("/threads/:id", async (c) => {
    try {
      const threadId = c.req.param("id");
      const body = await c.req.json();
      const thread = await storage.updateThread(threadId, body);
      return c.json(thread);
    } catch (error) {
      console.error("[Threads] Update error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Thread not found" }, 404);
      }
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Delete a thread
   * DELETE /threads/:id
   */
  app.delete("/threads/:id", async (c) => {
    try {
      const threadId = c.req.param("id");
      await storage.deleteThread(threadId);
      return c.body(null, 204);
    } catch (error) {
      console.error("[Threads] Delete error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Get messages for a thread
   * GET /threads/:id/messages
   */
  app.get("/threads/:id/messages", async (c) => {
    try {
      const threadId = c.req.param("id");
      const thread = await storage.getThread(threadId);
      if (!thread) {
        return c.json({ error: "Thread not found" }, 404);
      }
      const messages = await storage.getMessages(threadId);
      return c.json({ messages });
    } catch (error) {
      console.error("[Threads] Get messages error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Add a message to a thread
   * POST /threads/:id/messages
   * Body: { role: string, content: string, status?: string, toolCalls?: array, metadata?: object }
   */
  app.post("/threads/:id/messages", async (c) => {
    try {
      const threadId = c.req.param("id");
      const body = await c.req.json();

      if (!body.role || !body.content) {
        return c.json({ error: "Missing required fields: role, content" }, 400);
      }

      const message = await storage.addMessage(threadId, {
        role: body.role,
        content: body.content,
        status: body.status || "complete",
        toolCalls: body.toolCalls,
        metadata: body.metadata,
      });

      return c.json(message, 201);
    } catch (error) {
      console.error("[Threads] Add message error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Thread not found" }, 404);
      }
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Update a message
   * PATCH /threads/:id/messages/:messageId
   * Body: { content?: string, status?: string, toolCalls?: array, metadata?: object }
   */
  app.patch("/threads/:id/messages/:messageId", async (c) => {
    try {
      const threadId = c.req.param("id");
      const messageId = c.req.param("messageId");
      const body = await c.req.json();

      const message = await storage.updateMessage(threadId, messageId, body);
      return c.json(message);
    } catch (error) {
      console.error("[Threads] Update message error:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Message not found" }, 404);
      }
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  /**
   * Delete a message
   * DELETE /threads/:id/messages/:messageId
   */
  app.delete("/threads/:id/messages/:messageId", async (c) => {
    try {
      const threadId = c.req.param("id");
      const messageId = c.req.param("messageId");
      await storage.deleteMessage(threadId, messageId);
      return c.body(null, 204);
    } catch (error) {
      console.error("[Threads] Delete message error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });
}
