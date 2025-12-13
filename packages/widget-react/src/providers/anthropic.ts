import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelConfig } from "../config/types.js";
import { providerRegistry } from "./registry.js";

/**
 * Default Anthropic model
 */
const DEFAULT_MODEL = "claude-3-5-sonnet-20241022";

/**
 * Create Anthropic model from config
 */
function createAnthropicModel(config: ModelConfig) {
  if (!config.apiKey) {
    throw new Error("Anthropic API key is required");
  }

  const anthropic = createAnthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return anthropic(config.name || DEFAULT_MODEL);
}

/**
 * Register Anthropic provider
 */
export function registerAnthropicProvider() {
  providerRegistry.register(
    "anthropic",
    {
      name: "Anthropic",
      requiresApiKey: true,
    },
    createAnthropicModel
  );
}
