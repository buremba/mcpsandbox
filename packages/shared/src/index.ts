/**
 * @onemcp/shared - Shared types, schemas, and constants
 */

// Export all types
export * from "./types/index.js";

// Export VFS interface
export * from "./vfs/index.js";

// Export QuickJS utilities
export * from "./quickjs/index.js";
export * from "./quickjs/mcp-proxy.js";

// Export constants
export * from "./constants.js";

// Export JSON schemas (for runtime validation with ajv)
// Note: JSON imports will be handled by bundler/runtime
export const schemas = {
  capsule: {}, // TODO: load schema dynamically if needed
  relayConfig: {}, // TODO: load schema dynamically if needed
};
