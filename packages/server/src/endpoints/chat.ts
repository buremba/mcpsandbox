/**
 * Chat Endpoint
 *
 * Proxies LLM requests with:
 * - JWE token-based API key encryption
 * - Rate limiting (per-user, per-developer)
 * - Token counting for usage tracking
 * - Streaming support
 */

import type { Hono, Context } from "hono";
import { stream } from "hono/streaming";
import type { TokenManager, WidgetTokenPayload } from "../services/token-manager.js";
import type { RateLimiter } from "../services/rate-limiter.js";

/**
 * Anthropic API response types
 */
interface AnthropicResponse {
  id: string;
  model: string;
  content?: Array<{ text: string }>;
  stop_reason?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Google API response types
 */
interface GoogleResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Chat request body
 */
interface ChatRequest {
  /** Widget token (JWE encrypted) */
  token: string;
  /** Chat messages */
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  /** Model to use */
  model?: string;
  /** Maximum tokens in response */
  max_tokens?: number;
  /** Temperature */
  temperature?: number;
  /** Whether to stream */
  stream?: boolean;
  /** Additional provider-specific options */
  options?: Record<string, unknown>;
}

/**
 * Default provider API endpoints (used when no custom baseUrl is provided)
 */
const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

/**
 * Default models by provider
 */
const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-pro",
};

/**
 * Estimate tokens in a message (rough approximation)
 * More accurate counting would require a tokenizer
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens in a request
 */
function estimateRequestTokens(messages: ChatRequest["messages"], maxTokens: number = 4096): number {
  const inputTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
  return inputTokens + maxTokens;
}

/**
 * Setup chat endpoint
 */
export function setupChatEndpoint(
  app: Hono,
  tokenManager: TokenManager,
  rateLimiter: RateLimiter
): void {
  app.post("/chat", async (c) => {

    try {
      // Parse request body
      const body = await c.req.json<ChatRequest>();

      if (!body.token) {
        return c.json({ error: "Missing token" }, 401);
      }

      if (!body.messages || body.messages.length === 0) {
        return c.json({ error: "Missing messages" }, 400);
      }

      // Decrypt and validate token
      let payload: WidgetTokenPayload;
      try {
        payload = await tokenManager.decryptToken(body.token);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "Invalid token" },
          401
        );
      }

      // Estimate tokens for rate limiting
      const estimatedTokens = estimateRequestTokens(
        body.messages,
        body.max_tokens ?? 4096
      );

      // Check rate limits
      const rateLimit = await rateLimiter.checkAndUpdate(
        payload.developerId,
        payload.sub,
        payload.limits,
        estimatedTokens
      );

      // Add rate limit headers
      for (const [key, value] of Object.entries(rateLimit.headers)) {
        c.header(key, value);
      }

      if (!rateLimit.allowed) {
        return c.json(
          {
            error: "Rate limit exceeded",
            reason: rateLimit.reason,
            resetAt: rateLimit.resetAt,
          },
          429
        );
      }

      // Route to appropriate provider
      const model = body.model ?? DEFAULT_MODELS[payload.provider] ?? "gpt-4o";

      if (payload.provider === "openai") {
        return await proxyOpenAI(c, body, payload, model);
      } else if (payload.provider === "anthropic") {
        return await proxyAnthropic(c, body, payload, model);
      } else if (payload.provider === "google") {
        return await proxyGoogle(c, body, payload, model);
      } else {
        return c.json({ error: `Unknown provider: ${payload.provider}` }, 400);
      }
    } catch (error) {
      console.error("Chat endpoint error:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Internal error" },
        500
      );
    }
  });
}

/**
 * Proxy request to OpenAI
 */
async function proxyOpenAI(
  c: Context,
  body: ChatRequest,
  payload: WidgetTokenPayload,
  model: string
): Promise<Response> {
  const apiRequest = {
    model,
    messages: body.messages,
    max_tokens: Math.min(body.max_tokens ?? 4096, payload.limits.maxTokensPerRequest),
    temperature: body.temperature ?? 0.7,
    stream: body.stream ?? false,
    ...body.options,
  };

  // Use custom baseUrl if provided (e.g., Cloudflare AI Gateway), otherwise default
  const baseUrl = payload.baseUrl || DEFAULT_ENDPOINTS.openai;
  const endpoint = `${baseUrl}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.apiKey}`,
    },
    body: JSON.stringify(apiRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return c.json(
      { error: `OpenAI API error: ${response.status}`, details: errorText },
      response.status as any
    );
  }

  // Stream or return response
  if (body.stream) {
    return streamResponse(c, response);
  } else {
    const data = await response.json();
    return c.json(data);
  }
}

/**
 * Proxy request to Anthropic
 */
async function proxyAnthropic(
  c: Context,
  body: ChatRequest,
  payload: WidgetTokenPayload,
  model: string
): Promise<Response> {
  // Convert messages to Anthropic format
  const systemMessage = body.messages.find((m) => m.role === "system");
  const otherMessages = body.messages.filter((m) => m.role !== "system");

  const apiRequest = {
    model,
    messages: otherMessages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })),
    max_tokens: Math.min(body.max_tokens ?? 4096, payload.limits.maxTokensPerRequest),
    ...(systemMessage && { system: systemMessage.content }),
    stream: body.stream ?? false,
    ...body.options,
  };

  // Use custom baseUrl if provided, otherwise default
  const baseUrl = payload.baseUrl || DEFAULT_ENDPOINTS.anthropic;
  const endpoint = `${baseUrl}/messages`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": payload.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(apiRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return c.json(
      { error: `Anthropic API error: ${response.status}`, details: errorText },
      response.status as any
    );
  }

  // Stream or return response
  if (body.stream) {
    return streamResponse(c, response);
  } else {
    const data = await response.json() as AnthropicResponse;

    // Convert to OpenAI-compatible format for consistency
    return c.json({
      id: data.id,
      object: "chat.completion",
      model: data.model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: data.content?.[0]?.text ?? "",
          },
          finish_reason: data.stop_reason === "end_turn" ? "stop" : data.stop_reason,
        },
      ],
      usage: {
        prompt_tokens: data.usage?.input_tokens ?? 0,
        completion_tokens: data.usage?.output_tokens ?? 0,
        total_tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    });
  }
}

/**
 * Proxy request to Google
 */
async function proxyGoogle(
  c: Context,
  body: ChatRequest,
  payload: WidgetTokenPayload,
  model: string
): Promise<Response> {
  // Convert messages to Google format
  const contents = body.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = body.messages.find((m) => m.role === "system");

  const apiRequest = {
    contents,
    ...(systemInstruction && {
      systemInstruction: { parts: [{ text: systemInstruction.content }] },
    }),
    generationConfig: {
      maxOutputTokens: Math.min(body.max_tokens ?? 4096, payload.limits.maxTokensPerRequest),
      temperature: body.temperature ?? 0.7,
    },
    ...body.options,
  };

  // Use custom baseUrl if provided, otherwise default
  const baseUrl = payload.baseUrl || DEFAULT_ENDPOINTS.google;
  const endpoint = `${baseUrl}/models/${model}:${
    body.stream ? "streamGenerateContent" : "generateContent"
  }?key=${payload.apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(apiRequest),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return c.json(
      { error: `Google API error: ${response.status}`, details: errorText },
      response.status as any
    );
  }

  // Stream or return response
  if (body.stream) {
    return streamResponse(c, response);
  } else {
    const data = await response.json() as GoogleResponse;

    // Convert to OpenAI-compatible format for consistency
    const candidate = data.candidates?.[0];
    return c.json({
      id: crypto.randomUUID(),
      object: "chat.completion",
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: candidate?.content?.parts?.[0]?.text ?? "",
          },
          finish_reason: candidate?.finishReason?.toLowerCase() ?? "stop",
        },
      ],
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
    });
  }
}

/**
 * Stream response from provider to client
 */
function streamResponse(c: Context, response: Response): Response {
  return stream(c, async (stream) => {
    const reader = response.body?.getReader();
    if (!reader) {
      await stream.write("data: [ERROR]\n\n");
      return;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Pass through SSE data
        await stream.write(value);
      }
    } catch (error) {
      console.error("Stream error:", error);
    } finally {
      reader.releaseLock();
    }
  });
}
