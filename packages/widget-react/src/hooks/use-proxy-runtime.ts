/**
 * Proxy Runtime Hook
 *
 * Creates a secure AI SDK runtime that uses the relay-mcp proxy
 * for API key protection and rate limiting.
 */

import { useCallback, useMemo, useRef } from "react";
import type {
  ModelConfig,
  AuthHooksConfig,
  RateLimitInfo,
} from "../config/types.js";

/**
 * Chat message format
 */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Chat completion options
 */
interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Chat completion result
 */
interface ChatCompletionResult {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finishReason?: string;
}

/**
 * Proxy runtime state
 */
interface ProxyRuntimeState {
  isReady: boolean;
  isStreaming: boolean;
  error: Error | null;
  rateLimitInfo: RateLimitInfo | null;
}

/**
 * Proxy runtime hook result
 */
interface UseProxyRuntimeResult {
  /** Current runtime state */
  state: ProxyRuntimeState;
  /** Send a chat completion request */
  chat: (options: ChatCompletionOptions) => Promise<ChatCompletionResult>;
  /** Cancel the current streaming request */
  cancel: () => void;
  /** Check if proxy is configured */
  isProxyConfigured: boolean;
}

/**
 * Parse rate limit headers from response
 */
function parseRateLimitHeaders(headers: Headers): Partial<RateLimitInfo> {
  return {
    minuteResetAt: parseInt(headers.get("X-RateLimit-Reset-Minute") ?? "0") * 1000,
    dayResetAt: parseInt(headers.get("X-RateLimit-Reset-Day") ?? "0") * 1000,
    usage: {
      tokensUsedToday:
        parseInt(headers.get("X-RateLimit-Limit-Tokens-Day") ?? "0") -
        parseInt(headers.get("X-RateLimit-Remaining-Tokens-Day") ?? "0"),
      requestsToday:
        parseInt(headers.get("X-RateLimit-Limit-Requests-Day") ?? "0") -
        parseInt(headers.get("X-RateLimit-Remaining-Requests-Day") ?? "0"),
      requestsThisMinute:
        parseInt(headers.get("X-RateLimit-Limit-Requests-Minute") ?? "0") -
        parseInt(headers.get("X-RateLimit-Remaining-Requests-Minute") ?? "0"),
    },
  };
}

/**
 * Hook for creating a secure proxy runtime
 *
 * @param modelConfig Model configuration with secure proxy settings
 * @param authHooks Optional auth hooks for rate limit handling
 */
export function useProxyRuntime(
  modelConfig: ModelConfig,
  authHooks?: AuthHooksConfig
): UseProxyRuntimeResult {
  const abortControllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<ProxyRuntimeState>({
    isReady: true,
    isStreaming: false,
    error: null,
    rateLimitInfo: null,
  });

  const isProxyConfigured = Boolean(modelConfig.secure?.token && modelConfig.secure?.proxyEndpoint);

  /**
   * Send a chat completion request through the proxy
   */
  const chat = useCallback(
    async (options: ChatCompletionOptions): Promise<ChatCompletionResult> => {
      if (!modelConfig.secure) {
        throw new Error("Secure proxy not configured");
      }

      const { token, proxyEndpoint } = modelConfig.secure;

      // Create abort controller
      abortControllerRef.current = new AbortController();
      const signal = options.signal ?? abortControllerRef.current.signal;

      stateRef.current = {
        ...stateRef.current,
        isStreaming: options.stream ?? false,
        error: null,
      };

      try {
        const response = await fetch(proxyEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            messages: options.messages,
            model: options.model ?? modelConfig.name,
            max_tokens: options.max_tokens,
            temperature: options.temperature,
            stream: options.stream,
          }),
          signal,
        });

        // Parse rate limit headers
        const rateLimitInfo = parseRateLimitHeaders(response.headers);

        // Handle rate limit exceeded
        if (response.status === 429) {
          const errorBody = await response.json();
          const fullRateLimitInfo: RateLimitInfo = {
            reason: errorBody.reason ?? "Rate limit exceeded",
            minuteResetAt: rateLimitInfo.minuteResetAt ?? 0,
            dayResetAt: rateLimitInfo.dayResetAt ?? 0,
            usage: rateLimitInfo.usage ?? {
              tokensUsedToday: 0,
              requestsToday: 0,
              requestsThisMinute: 0,
            },
          };

          stateRef.current.rateLimitInfo = fullRateLimitInfo;

          if (authHooks?.onRateLimitExceeded) {
            authHooks.onRateLimitExceeded(fullRateLimitInfo);
          }

          throw new Error(fullRateLimitInfo.reason);
        }

        if (!response.ok) {
          const errorBody = await response.json();
          throw new Error(errorBody.error ?? `HTTP ${response.status}`);
        }

        // Handle streaming response
        if (options.stream && response.body) {
          let content = "";
          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });

              // Parse SSE data
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const data = line.slice(6);
                  if (data === "[DONE]") break;

                  try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content ?? "";
                    if (delta) {
                      content += delta;
                      options.onChunk?.(delta);
                    }
                  } catch {
                    // Ignore parse errors in stream
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          stateRef.current.isStreaming = false;

          return {
            content,
            finishReason: "stop",
          };
        }

        // Handle non-streaming response
        const data = await response.json();

        stateRef.current.isStreaming = false;

        return {
          content: data.choices?.[0]?.message?.content ?? "",
          usage: data.usage,
          finishReason: data.choices?.[0]?.finish_reason,
        };
      } catch (error) {
        stateRef.current = {
          ...stateRef.current,
          isStreaming: false,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        throw error;
      }
    },
    [modelConfig, authHooks]
  );

  /**
   * Cancel the current streaming request
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stateRef.current.isStreaming = false;
  }, []);

  return {
    state: stateRef.current,
    chat,
    cancel,
    isProxyConfigured,
  };
}

/**
 * Check if a model config uses secure proxy
 */
export function isSecureProxy(modelConfig: ModelConfig): boolean {
  return Boolean(modelConfig.secure?.token && modelConfig.secure?.proxyEndpoint);
}
