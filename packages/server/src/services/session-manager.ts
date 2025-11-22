/**
 * Session management (spec §1.3, v1.3)
 */

import { nanoid } from "nanoid";
import { SignJWT, importPKCS8, type KeyLike } from "jose";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { SESSION_CONFIG } from "@onemcp/shared";
import type { Session, BackchannelEvent } from "@onemcp/shared";

export class SessionManager {
  private sessions = new Map<string, Session>();
  private privateKey: KeyLike | null = null;
  private eventEmitters = new Map<string, EventEmitter>();
  private resultQueues = new Map<string, BackchannelEvent[]>();

  constructor(private keyPath: string) {}

  async initialize() {
    const keyPem = await readFile(this.keyPath, "utf-8");
    this.privateKey = await importPKCS8(keyPem, "EdDSA");

    // Cleanup task: remove stale sessions
    setInterval(() => this.cleanup(), 60_000); // every minute
  }

  async createSession(type: "browser" | "mcp" = "browser"): Promise<{ sessionId: string; attachToken: string }> {
    if (!this.privateKey) {
      throw new Error("SessionManager not initialized");
    }

    const sessionId = nanoid();
    const now = Date.now();

    // Generate JWT attach token (5min expiry)
    const attachToken = await new SignJWT({ sessionId })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_CONFIG.TOKEN_TTL_MS / 1000}s`)
      .sign(this.privateKey);

    const session: Session = {
      id: sessionId,
      type,
      attachToken,
      createdAt: now,
      lastSeen: now,
      browserAttached: false,
    };

    this.sessions.set(sessionId, session);
    return { sessionId, attachToken };
  }

  attachBrowser(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.browserAttached = true;
    session.lastSeen = Date.now();
    return true;
  }

  detachBrowser(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.browserAttached = false;
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  updateLastSeen(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastSeen = Date.now();
    }
  }

  hasBrowserAttached(): boolean {
    return Array.from(this.sessions.values()).some((s) => s.browserAttached);
  }

  getAttachedSessionId(): string | null {
    const session = Array.from(this.sessions.values()).find(
      (s) => s.browserAttached
    );
    return session?.id || null;
  }

  getEventEmitter(sessionId: string): EventEmitter | undefined {
    return this.eventEmitters.get(sessionId);
  }

  createEventEmitter(sessionId: string): EventEmitter {
    const emitter = new EventEmitter();
    this.eventEmitters.set(sessionId, emitter);
    return emitter;
  }

  sendCommand(sessionId: string, command: any): void {
    const emitter = this.eventEmitters.get(sessionId);
    if (emitter) {
      emitter.emit("command", command);
    }
  }

  addResult(sessionId: string, event: BackchannelEvent): void {
    if (!this.resultQueues.has(sessionId)) {
      this.resultQueues.set(sessionId, []);
    }
    this.resultQueues.get(sessionId)!.push(event);
  }

  getResults(sessionId: string, runId: string): BackchannelEvent[] {
    const queue = this.resultQueues.get(sessionId) || [];
    return queue.filter((e) => e.runId === runId);
  }

  clearResults(sessionId: string, runId: string): void {
    const queue = this.resultQueues.get(sessionId);
    if (queue) {
      const filtered = queue.filter((e) => e.runId !== runId);
      this.resultQueues.set(sessionId, filtered);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const ttl = SESSION_CONFIG.CLEANUP_TTL_MS;

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastSeen > ttl) {
        this.sessions.delete(id);
        this.eventEmitters.delete(id);
        this.resultQueues.delete(id);
      }
    }
  }
}
