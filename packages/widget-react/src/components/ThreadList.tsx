/**
 * Thread list component
 * Displays a list of conversation threads with options to create, switch, and delete
 */

import React, { useState, useCallback } from "react";
import type { ThreadListItem } from "@onemcp/shared";

export interface ThreadListProps {
  /** List of threads to display */
  threads: ThreadListItem[];
  /** Currently active thread ID */
  activeThreadId: string | null;
  /** Whether threads are loading */
  isLoading: boolean;
  /** Called when user clicks on a thread */
  onThreadSelect: (threadId: string) => void;
  /** Called when user clicks the new thread button */
  onNewThread: () => void;
  /** Called when user deletes a thread */
  onDeleteThread: (threadId: string) => void;
  /** Called when user archives a thread */
  onArchiveThread?: (threadId: string) => void;
  /** Called when user wants to start chatting without threads */
  onStartChat?: () => void;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ThreadList({
  threads,
  activeThreadId,
  isLoading,
  onThreadSelect,
  onNewThread,
  onDeleteThread,
  onArchiveThread,
  onStartChat,
}: ThreadListProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleThreadClick = useCallback(
    (threadId: string) => {
      setMenuOpenId(null);
      onThreadSelect(threadId);
    },
    [onThreadSelect]
  );

  const handleMenuToggle = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      e.stopPropagation();
      setMenuOpenId(menuOpenId === threadId ? null : threadId);
    },
    [menuOpenId]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      e.stopPropagation();
      setMenuOpenId(null);
      onDeleteThread(threadId);
    },
    [onDeleteThread]
  );

  const handleArchive = useCallback(
    (e: React.MouseEvent, threadId: string) => {
      e.stopPropagation();
      setMenuOpenId(null);
      onArchiveThread?.(threadId);
    },
    [onArchiveThread]
  );

  return (
    <div
      className="onemcp-thread-list"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--onemcp-bg-primary, #ffffff)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--onemcp-border, #e5e5e5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--onemcp-text-primary, #1a1a1a)",
          }}
        >
          Conversations
        </h3>
        {/* Only show New button if there are existing conversations */}
        {threads.length > 0 && (
          <button
            onClick={onNewThread}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              backgroundColor: "var(--onemcp-accent, #0066ff)",
              color: "var(--onemcp-accent-text, #ffffff)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
        )}
      </div>

      {/* Thread List */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px",
        }}
      >
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 20px",
              color: "var(--onemcp-text-secondary, #666)",
              fontSize: 13,
            }}
          >
            Loading conversations...
          </div>
        ) : threads.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 20px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: "var(--onemcp-bg-secondary, #f5f5f5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--onemcp-text-secondary, #666)"
                strokeWidth="1.5"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p
              style={{
                margin: "0 0 16px 0",
                color: "var(--onemcp-text-secondary, #666)",
                fontSize: 13,
              }}
            >
              No conversations yet
            </p>
            <button
              onClick={onStartChat || onNewThread}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "none",
                backgroundColor: "var(--onemcp-accent, #0066ff)",
                color: "var(--onemcp-accent-text, #ffffff)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Start a conversation
            </button>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {threads.map((thread) => (
              <li key={thread.id} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => handleThreadClick(thread.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor:
                      activeThreadId === thread.id
                        ? "var(--onemcp-accent-light, rgba(0, 102, 255, 0.1))"
                        : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (activeThreadId !== thread.id) {
                      e.currentTarget.style.backgroundColor =
                        "var(--onemcp-bg-secondary, #f5f5f5)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeThreadId !== thread.id) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  {/* Thread icon */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: "var(--onemcp-bg-secondary, #f5f5f5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--onemcp-text-secondary, #666)"
                      strokeWidth="1.5"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>

                  {/* Thread info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--onemcp-text-primary, #1a1a1a)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {thread.title || "Untitled conversation"}
                    </div>
                    {thread.lastMessagePreview && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--onemcp-text-secondary, #666)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 2,
                        }}
                      >
                        {thread.lastMessagePreview}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--onemcp-text-tertiary, #999)",
                        marginTop: 4,
                        display: "flex",
                        gap: 8,
                      }}
                    >
                      <span>{formatTimeAgo(thread.updatedAt)}</span>
                      <span>{thread.messageCount} messages</span>
                    </div>
                  </div>

                  {/* Menu button */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={(e) => handleMenuToggle(e, thread.id)}
                      style={{
                        padding: 4,
                        borderRadius: 4,
                        border: "none",
                        backgroundColor: "transparent",
                        cursor: "pointer",
                        color: "var(--onemcp-text-secondary, #666)",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>

                    {/* Dropdown menu */}
                    {menuOpenId === thread.id && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          right: 0,
                          marginTop: 4,
                          backgroundColor: "var(--onemcp-bg-primary, #ffffff)",
                          border: "1px solid var(--onemcp-border, #e5e5e5)",
                          borderRadius: 6,
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          zIndex: 10,
                          minWidth: 120,
                          overflow: "hidden",
                        }}
                      >
                        {onArchiveThread && (
                          <button
                            onClick={(e) => handleArchive(e, thread.id)}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 12px",
                              border: "none",
                              backgroundColor: "transparent",
                              cursor: "pointer",
                              fontSize: 12,
                              color: "var(--onemcp-text-primary, #1a1a1a)",
                              textAlign: "left",
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="m21 8-2 2m0 0-9 9-4-4 9-9m2 2 2-2-3-3-2 2m2 2-2-2" />
                            </svg>
                            Archive
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(e, thread.id)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            border: "none",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            fontSize: 12,
                            color: "#ef4444",
                            textAlign: "left",
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
