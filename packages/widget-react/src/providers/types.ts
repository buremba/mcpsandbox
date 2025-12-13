import type { LanguageModel } from "ai";
import type { ModelConfig } from "../config/types.js";

/**
 * Provider metadata
 */
export interface ProviderMetadata {
  id: string;
  name: string;
  requiresApiKey: boolean;
}

/**
 * Provider factory function
 */
export type ProviderFactory = (config: ModelConfig) => LanguageModel;

/**
 * Provider registration
 */
export interface ProviderRegistration {
  metadata: ProviderMetadata;
  factory: ProviderFactory;
}
