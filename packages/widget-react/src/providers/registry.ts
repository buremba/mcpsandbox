import type { LanguageModel } from "ai";
import type { ModelConfig } from "../config/types.js";
import type { ProviderRegistration, ProviderFactory, ProviderMetadata } from "./types.js";

/**
 * Provider registry for managing LLM providers
 */
class ProviderRegistry {
  private providers = new Map<string, ProviderRegistration>();

  /**
   * Register a new provider
   */
  register(
    id: string,
    metadata: Omit<ProviderMetadata, "id">,
    factory: ProviderFactory
  ): void {
    this.providers.set(id, {
      metadata: { ...metadata, id },
      factory,
    });
  }

  /**
   * Unregister a provider
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Get a provider by ID
   */
  get(id: string): ProviderRegistration | undefined {
    return this.providers.get(id);
  }

  /**
   * Check if a provider exists
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * List all registered provider IDs
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * List all provider metadata
   */
  listMetadata(): ProviderMetadata[] {
    return Array.from(this.providers.values()).map((p) => p.metadata);
  }

  /**
   * Create a model from config
   */
  createModel(config: ModelConfig): LanguageModel {
    const registration = this.providers.get(config.provider);

    if (!registration) {
      throw new Error(
        `Unknown provider: ${config.provider}. Available providers: ${this.list().join(", ")}`
      );
    }

    // Validate API key if required
    if (registration.metadata.requiresApiKey && !config.apiKey) {
      throw new Error(
        `API key required for provider: ${config.provider}`
      );
    }

    return registration.factory(config);
  }
}

/**
 * Global provider registry instance
 */
export const providerRegistry = new ProviderRegistry();
