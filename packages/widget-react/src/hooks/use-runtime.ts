import React, { useMemo } from "react";
import { streamText, stepCountIs } from "ai";
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunResult,
} from "@assistant-ui/react";
import { providerRegistry, createChromeModel } from "../providers/index.js";
import type { WidgetConfig } from "../config/types.js";

// Tool call content part for assistant-ui
interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  argsText: string;
  result?: unknown;
  isError?: boolean;
}

/**
 * Convert assistant-ui messages to AI SDK format
 */
function convertMessages(messages: readonly any[]) {
  return messages.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n"),
  }));
}

/**
 * Create a ChatModelAdapter for AI SDK
 */
function createAISDKAdapter(
  config: WidgetConfig,
  tools: Record<string, any>
): ChatModelAdapter {
  let model: any;
  try {
    model = providerRegistry.createModel(config.model);
    console.log("[Widget] Model created successfully:", config.model.provider);
  } catch (error) {
    console.error("[Widget] Failed to create model:", error);
    throw error;
  }

  return {
    async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult> {
      try {
        console.log("[Widget] Running with messages:", messages.length);
        const convertedMessages = convertMessages(messages);

        // Add system prompt if provided
        if (config.widget?.systemPrompt) {
          convertedMessages.unshift({
            role: "system" as const,
            content: config.widget.systemPrompt,
          });
        }

        // Determine if we have tools
        const hasTools = Object.keys(tools).length > 0;
        console.log("[Widget] Has tools:", hasTools, Object.keys(tools));

        const result = streamText({
          model,
          messages: convertedMessages,
          tools: hasTools ? tools : undefined,
          abortSignal,
        });

        let text = "";

        // Stream the text
        for await (const chunk of result.textStream) {
          text += chunk;
          yield {
            content: [{ type: "text", text }],
          };
        }

        // Get final result text
        const finalText = await result.text;

        // Final yield with complete content
        yield {
          content: [{ type: "text", text: finalText || text }],
        };
        console.log("[Widget] Stream completed");
      } catch (error) {
        // Handle errors gracefully
        console.error("[Widget] Error in run:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        yield {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
        };
      }
    },
  };
}

/**
 * Options for useWidgetRuntime
 */
export interface UseWidgetRuntimeOptions {
  config: WidgetConfig;
  tools?: Record<string, any>;
}

/**
 * Hook to create an assistant-ui runtime for the widget
 */
export function useWidgetRuntime({ config, tools = {} }: UseWidgetRuntimeOptions) {
  // Use refs to avoid recreating the adapter on every render
  const configRef = React.useRef(config);
  const toolsRef = React.useRef(tools);

  // Update refs when values change
  React.useEffect(() => {
    configRef.current = config;
    toolsRef.current = tools;
    console.log("[Widget] Updated runtime refs - tools:", Object.keys(tools).length);
  }, [config, tools]);

  // Create adapter once with refs for latest values
  const adapter = useMemo<ChatModelAdapter>(() => {
    console.log("[Widget] Creating adapter");
    return {
      async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult> {
        const currentConfig = configRef.current;
        const currentTools = toolsRef.current;

        try {
          console.log("[Widget] Running with messages:", messages.length);
          const convertedMessages = convertMessages(messages);

          // Add system prompt if provided
          if (currentConfig.widget?.systemPrompt) {
            convertedMessages.unshift({
              role: "system" as const,
              content: currentConfig.widget.systemPrompt,
            });
          }

          // Determine provider and tools
          const isChrome = currentConfig.model.provider === "chrome";
          const isMock = currentConfig.model.provider === "mock";
          const hasTools = Object.keys(currentTools).length > 0;
          console.log("[Widget] Provider:", currentConfig.model.provider, "Has tools:", hasTools, "Tools:", Object.keys(currentTools));

          // Mock provider for testing tool calls without API key
          if (isMock && hasTools) {
            const lastMessage = convertedMessages[convertedMessages.length - 1];
            const userText = lastMessage?.content?.toLowerCase() || "";

            // Check if user is asking for a tool
            let toolToCall: string | null = null;
            let toolArgs: Record<string, unknown> = {};

            for (const toolName of Object.keys(currentTools)) {
              const shortName = toolName.replace(/^[^_]+_/, ""); // Remove prefix like "test_"
              if (userText.includes(shortName) || userText.includes(toolName)) {
                toolToCall = toolName;
                // Parse any numbers for initialValue
                const numMatch = userText.match(/(\d+)/);
                if (numMatch) {
                  toolArgs = { initialValue: parseInt(numMatch[1], 10) };
                }
                break;
              }
            }

            if (toolToCall) {
              console.log("[Widget] Mock mode: Calling tool", toolToCall, "with args", toolArgs);
              const toolCallId = `mock-${Date.now()}`;

              // Execute the tool
              const toolDef = currentTools[toolToCall];
              let toolResult: unknown;
              try {
                toolResult = await toolDef.execute(toolArgs, { toolCallId, messages: [] });
              } catch (e) {
                toolResult = { error: String(e) };
              }

              // Yield the tool call with result
              yield {
                content: [
                  {
                    type: "tool-call" as const,
                    toolCallId,
                    toolName: toolToCall,
                    args: toolArgs as any,
                    argsText: JSON.stringify(toolArgs, null, 2),
                    result: toolResult,
                  },
                  { type: "text" as const, text: `Called ${toolToCall}` },
                ] as any,
              };
              return;
            } else {
              // No tool matched, just respond
              yield {
                content: [{ type: "text" as const, text: "I can help you with tools. Try asking me to 'show counter' or 'show search form'." }],
              };
              return;
            }
          }

          // Create model - Chrome provider handles tools internally
          let model;
          if (isChrome) {
            // Chrome provider with native tool support
            model = createChromeModel(hasTools ? currentTools : {});
          } else {
            model = providerRegistry.createModel(currentConfig.model);
          }

          const result = streamText({
            model,
            messages: convertedMessages,
            // Only pass tools to non-Chrome providers (Chrome handles internally)
            tools: (!isChrome && hasTools) ? currentTools : undefined,
            abortSignal,
            stopWhen: (!isChrome && hasTools) ? stepCountIs(5) : undefined,
          });

          let text = "";
          const toolCalls: Map<string, ToolCallPart> = new Map();

          // Type for content parts
          type ContentPart =
            | { type: "text"; text: string }
            | { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown>; argsText: string; result?: unknown; isError?: boolean };

          // Helper to build content array
          const buildContent = (): ContentPart[] => {
            const content: ContentPart[] = [];
            if (text) {
              content.push({ type: "text", text });
            }
            for (const tc of toolCalls.values()) {
              content.push({
                type: "tool-call",
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                args: tc.args,
                argsText: tc.argsText,
                result: tc.result,
                isError: tc.isError,
              });
            }
            return content;
          };

          // Stream the full text (including after tool calls)
          for await (const chunk of result.fullStream) {
            if (chunk.type === "text-delta") {
              // AI SDK uses 'text' for the delta content
              text += (chunk as any).text || (chunk as any).textDelta || "";
              const content = buildContent();
              if (content.length > 0) {
                yield { content: content as any };
              }
            } else if (chunk.type === "tool-call") {
              // Get args - could be in 'args' or 'input' depending on AI SDK version
              const args = ('args' in chunk ? chunk.args : (chunk as any).input) as Record<string, unknown>;
              console.log("[Widget] Tool call:", chunk.toolName, args);
              const toolCallPart: ToolCallPart = {
                type: "tool-call",
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                args: args || {},
                argsText: JSON.stringify(args || {}, null, 2),
              };
              toolCalls.set(chunk.toolCallId, toolCallPart);
              yield { content: buildContent() as any };
            } else if (chunk.type === "tool-result") {
              // Get result - could be in 'result' or 'output' depending on AI SDK version
              const resultData = ('result' in chunk ? chunk.result : (chunk as any).output);
              console.log("[Widget] Tool result:", chunk.toolName, resultData);
              const existing = toolCalls.get(chunk.toolCallId);
              if (existing) {
                existing.result = resultData;
                yield { content: buildContent() as any };
              }
            }
          }

          // Get final result text
          const finalText = await result.text;

          // Final yield with complete content
          const finalContent = buildContent();
          // Update text with final if available
          if (finalText && finalText !== text) {
            const textIdx = finalContent.findIndex(c => c.type === "text");
            if (textIdx >= 0) {
              (finalContent[textIdx] as { type: "text"; text: string }).text = finalText;
            } else {
              finalContent.unshift({ type: "text", text: finalText });
            }
          }
          if (finalContent.length > 0) {
            yield { content: finalContent as any };
          } else {
            yield { content: [{ type: "text", text: "" }] };
          }
          console.log("[Widget] Stream completed, final text length:", (finalText || text).length, "tool calls:", toolCalls.size);
        } catch (error) {
          // Handle errors gracefully
          console.error("[Widget] Error in run:", error);
          const errorMessage = error instanceof Error ? error.message : String(error);

          // Provide user-friendly error messages
          let userMessage = `Error: ${errorMessage}`;

          if (errorMessage.includes("Prompt API is not available") ||
              errorMessage.includes("LanguageModel") ||
              errorMessage.includes("not available")) {
            userMessage = `**Chrome Built-in AI is not available**

To use Chrome's built-in AI, you need to:

1. Use **Chrome 128+** (or Edge Dev/Canary 138+)
2. Enable the flag at \`chrome://flags/#prompt-api-for-gemini-nano\`
3. Go to \`chrome://components\` and update "Optimization Guide On Device Model"
4. Restart your browser

Alternatively, switch to OpenAI or Anthropic provider in the config.`;
          } else if (errorMessage.includes("No output generated")) {
            userMessage = `**No response from AI model**

The model did not generate any output. This could be because:
- The Chrome AI model is still downloading
- The prompt was empty or invalid
- There was a network/API error

Please check the browser console for more details.`;
          }

          yield {
            content: [{ type: "text", text: userMessage }],
          };
        }
      },
    };
  }, []); // Empty deps - adapter is created once and uses refs

  // Create the local runtime
  const runtime = useLocalRuntime(adapter);

  return runtime;
}
