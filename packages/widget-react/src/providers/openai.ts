import { createOpenAI } from "@ai-sdk/openai";
import type { ModelConfig } from "../config/types.js";
import { providerRegistry } from "./registry.js";

/**
 * Default OpenAI model
 */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Create OpenAI model from config
 */
function createOpenAIModel(config: ModelConfig) {
  if (!config.apiKey) {
    throw new Error("OpenAI API key is required");
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  return openai(config.name || DEFAULT_MODEL);
}

/**
 * Register OpenAI provider
 */
export function registerOpenAIProvider() {
  providerRegistry.register(
    "openai",
    {
      name: "OpenAI",
      requiresApiKey: true,
    },
    createOpenAIModel
  );
}
