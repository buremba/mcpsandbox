import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import { LoadSettingError } from "@ai-sdk/provider";
import type { Tool } from "ai";
import type { ModelConfig } from "../config/types.js";
import { providerRegistry } from "./registry.js";

// =============================================================================
// Chrome Prompt API Types (global in browser)
// =============================================================================

interface ChromeLanguageModelTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

interface ChromeLanguageModelMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; value: unknown }>;
}

interface ChromeLanguageModelSession {
  prompt(
    input: string,
    options?: { signal?: AbortSignal }
  ): Promise<string>;
  promptStreaming(
    input: string,
    options?: { signal?: AbortSignal }
  ): ReadableStream<string>;
}

interface ChromeLanguageModelCreateOptions {
  initialPrompts?: Array<{ role: string; content: string }>;
  tools?: ChromeLanguageModelTool[];
  temperature?: number;
  topK?: number;
}

// Declare the global LanguageModel class from Chrome's Prompt API
declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: {
    availability(): Promise<"unavailable" | "downloadable" | "downloading" | "readily">;
    create(options?: ChromeLanguageModelCreateOptions): Promise<ChromeLanguageModelSession>;
  } | undefined;
}

// =============================================================================
// Tool Execution Tracker
// =============================================================================

interface TrackedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

class ToolExecutionTracker {
  private calls: TrackedToolCall[] = [];
  private idCounter = 0;

  generateId(): string {
    return `call-${Date.now()}-${++this.idCounter}`;
  }

  recordCall(id: string, name: string, input: Record<string, unknown>): void {
    this.calls.push({ id, name, input });
  }

  recordResult(id: string, result: unknown): void {
    const call = this.calls.find((c) => c.id === id);
    if (call) call.result = result;
  }

  recordError(id: string, error: string): void {
    const call = this.calls.find((c) => c.id === id);
    if (call) call.error = error;
  }

  getCalls(): TrackedToolCall[] {
    return this.calls;
  }

  hasCalls(): boolean {
    return this.calls.length > 0;
  }
}

// =============================================================================
// Message Conversion
// =============================================================================

interface ConvertedMessages {
  systemMessage: string | undefined;
  initialPrompts: Array<{ role: "user" | "assistant"; content: string }>;
  currentPrompt: string;
}

function convertMessages(prompt: LanguageModelV2Prompt): ConvertedMessages {
  let systemMessage: string | undefined;
  const initialPrompts: Array<{ role: "user" | "assistant"; content: string }> = [];
  let currentPrompt = "";

  for (let i = 0; i < prompt.length; i++) {
    const message = prompt[i];
    const isLast = i === prompt.length - 1;

    switch (message.role) {
      case "system":
        systemMessage = message.content;
        break;

      case "user": {
        const text = message.content
          .filter((part): part is { type: "text"; text: string } => part.type === "text")
          .map((part) => part.text)
          .join("\n");

        if (isLast) {
          currentPrompt = text;
        } else {
          initialPrompts.push({ role: "user", content: text });
        }
        break;
      }

      case "assistant": {
        let text = "";
        for (const part of message.content) {
          if (part.type === "text") {
            text += part.text;
          }
        }
        if (text) {
          initialPrompts.push({ role: "assistant", content: text });
        }
        break;
      }

      case "tool":
        // Tool results - Chrome handles these internally
        break;
    }
  }

  return { systemMessage, initialPrompts, currentPrompt };
}

// =============================================================================
// Schema Extraction
// =============================================================================

function getToolInputSchema(tool: Tool): Record<string, unknown> {
  // AI SDK tools have parameters which could be Zod schema or JSON Schema
  const params = (tool as any).parameters;
  if (!params) {
    return { type: "object", properties: {} };
  }

  // If it's a Zod schema, try to get JSON schema
  if (params._def) {
    // Zod schema - extract shape
    try {
      const shape = params._def.shape?.();
      if (shape) {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [key, value] of Object.entries(shape)) {
          const zodDef = (value as any)?._def;
          properties[key] = {
            type: zodDef?.typeName?.replace("Zod", "").toLowerCase() || "string",
            description: zodDef?.description || "",
          };
          if (!zodDef?.isOptional) {
            required.push(key);
          }
        }
        return { type: "object", properties, required };
      }
    } catch {
      // Fall through to default
    }
  }

  // Already JSON Schema or unknown format
  return params;
}

// =============================================================================
// Chrome Language Model Implementation
// =============================================================================

export class ChromeLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "chrome";
  readonly modelId = "text";
  readonly supportedUrls: Record<string, RegExp[]> = {
    "image/*": [/^https?:\/\/.+$/],
    "audio/*": [/^https?:\/\/.+$/],
  };

  private tools: Record<string, Tool>;

  constructor(tools: Record<string, Tool> = {}) {
    this.tools = tools;
  }

  private convertTools(tracker: ToolExecutionTracker): ChromeLanguageModelTool[] {
    return Object.entries(this.tools).map(([name, tool]) => ({
      name,
      description: tool.description || "",
      inputSchema: getToolInputSchema(tool),
      execute: async (args: Record<string, unknown>): Promise<string> => {
        const callId = tracker.generateId();
        tracker.recordCall(callId, name, args);

        try {
          if (!tool.execute) {
            throw new Error(`Tool ${name} has no execute function`);
          }

          const result = await tool.execute(args, {
            toolCallId: callId,
            messages: [],
          });

          tracker.recordResult(callId, result);
          return typeof result === "string" ? result : JSON.stringify(result);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          tracker.recordError(callId, errorMsg);
          throw error;
        }
      },
    }));
  }

  private async getSession(
    systemMessage: string | undefined,
    initialPrompts: Array<{ role: "user" | "assistant"; content: string }>,
    tools: ChromeLanguageModelTool[]
  ): Promise<ChromeLanguageModelSession> {
    if (typeof globalThis.LanguageModel === "undefined") {
      throw new LoadSettingError({
        message:
          "Chrome Prompt API is not available. Enable chrome://flags/#prompt-api-for-gemini-nano",
      });
    }

    const availability = await globalThis.LanguageModel.availability();
    if (availability === "unavailable") {
      throw new LoadSettingError({
        message: "Built-in AI model not available on this device",
      });
    }

    const options: ChromeLanguageModelCreateOptions = {};

    // Build initialPrompts array with system message first, then conversation history
    const allPrompts: Array<{ role: string; content: string }> = [];
    if (systemMessage) {
      allPrompts.push({ role: "system", content: systemMessage });
    }
    allPrompts.push(...initialPrompts);

    if (allPrompts.length > 0) {
      options.initialPrompts = allPrompts;
    }

    if (tools.length > 0) {
      options.tools = tools;
    }

    return globalThis.LanguageModel.create(options);
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[];
    finishReason: LanguageModelV2FinishReason;
    usage: { inputTokens: undefined; outputTokens: undefined; totalTokens: undefined };
    warnings: LanguageModelV2CallWarning[];
    request?: { body?: unknown };
  }> {
    const { prompt, abortSignal } = options;
    const warnings: LanguageModelV2CallWarning[] = [];

    const { systemMessage, initialPrompts, currentPrompt } = convertMessages(prompt);
    const tracker = new ToolExecutionTracker();
    const hasTools = Object.keys(this.tools).length > 0;
    const chromeTools = hasTools ? this.convertTools(tracker) : [];

    const session = await this.getSession(systemMessage, initialPrompts, chromeTools);
    const text = await session.prompt(currentPrompt, { signal: abortSignal });

    // Build content array with tool calls, results, and text
    const content: LanguageModelV2Content[] = [];

    for (const call of tracker.getCalls()) {
      content.push({
        type: "tool-call",
        toolCallId: call.id,
        toolName: call.name,
        input: JSON.stringify(call.input),
        providerExecuted: true,
      } as LanguageModelV2Content);

      if (call.result !== undefined) {
        content.push({
          type: "tool-result",
          toolCallId: call.id,
          toolName: call.name,
          result: call.result,
          providerExecuted: true,
        } as LanguageModelV2Content);
      }
    }

    content.push({ type: "text", text });

    return {
      content,
      finishReason: tracker.hasCalls() ? "tool-calls" : "stop",
      usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
      warnings,
      request: { body: { prompt: currentPrompt, initialPrompts, tools: chromeTools.map((t) => t.name) } },
    };
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    request?: { body?: unknown };
  }> {
    const { prompt, abortSignal } = options;

    const { systemMessage, initialPrompts, currentPrompt } = convertMessages(prompt);
    const tracker = new ToolExecutionTracker();
    const hasTools = Object.keys(this.tools).length > 0;
    const chromeTools = hasTools ? this.convertTools(tracker) : [];

    const session = await this.getSession(systemMessage, initialPrompts, chromeTools);
    const promptStream = session.promptStreaming(currentPrompt, { signal: abortSignal });

    const textId = "text-0";
    let isFirstChunk = true;
    let toolEventsEmitted = false;
    const trackerRef = tracker;

    const stream = promptStream.pipeThrough(
      new TransformStream<string, LanguageModelV2StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
        },

        transform(chunk, controller) {
          // Emit tool events before first text chunk
          if (!toolEventsEmitted && trackerRef.hasCalls()) {
            for (const call of trackerRef.getCalls()) {
              controller.enqueue({
                type: "tool-call",
                toolCallId: call.id,
                toolName: call.name,
                input: JSON.stringify(call.input),
                providerExecuted: true,
              } as LanguageModelV2StreamPart);

              if (call.result !== undefined) {
                controller.enqueue({
                  type: "tool-result",
                  toolCallId: call.id,
                  toolName: call.name,
                  result: call.result,
                  providerExecuted: true,
                } as LanguageModelV2StreamPart);
              }
            }
            toolEventsEmitted = true;
          }

          if (isFirstChunk) {
            controller.enqueue({ type: "text-start", id: textId });
            isFirstChunk = false;
          }

          controller.enqueue({ type: "text-delta", id: textId, delta: chunk });
        },

        flush(controller) {
          // Emit any remaining tool events
          if (!toolEventsEmitted && trackerRef.hasCalls()) {
            for (const call of trackerRef.getCalls()) {
              controller.enqueue({
                type: "tool-call",
                toolCallId: call.id,
                toolName: call.name,
                input: JSON.stringify(call.input),
                providerExecuted: true,
              } as LanguageModelV2StreamPart);

              if (call.result !== undefined) {
                controller.enqueue({
                  type: "tool-result",
                  toolCallId: call.id,
                  toolName: call.name,
                  result: call.result,
                  providerExecuted: true,
                } as LanguageModelV2StreamPart);
              }
            }
          }

          if (!isFirstChunk) {
            controller.enqueue({ type: "text-end", id: textId });
          }

          controller.enqueue({
            type: "finish",
            finishReason: trackerRef.hasCalls() ? "tool-calls" : "stop",
            usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
          });
        },
      })
    );

    return {
      stream,
      request: { body: { prompt: currentPrompt, initialPrompts, tools: chromeTools.map((t) => t.name) } },
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Create Chrome AI model with optional tools
 */
export function createChromeModel(tools: Record<string, Tool> = {}): LanguageModelV2 {
  return new ChromeLanguageModel(tools);
}

/**
 * Check if Chrome AI is available
 */
export async function isChromeAIAvailable(): Promise<boolean> {
  if (typeof globalThis.LanguageModel === "undefined") {
    return false;
  }

  try {
    const availability = await globalThis.LanguageModel.availability();
    return availability === "readily" || availability === "downloadable";
  } catch {
    return false;
  }
}

/**
 * Register Chrome AI provider (for config-based usage without tools)
 */
export function registerChromeProvider() {
  providerRegistry.register(
    "chrome",
    {
      name: "Chrome Built-in AI",
      requiresApiKey: false,
    },
    (_config: ModelConfig) => createChromeModel({})
  );
}
