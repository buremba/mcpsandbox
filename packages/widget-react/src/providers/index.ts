export * from "./types.js";
export { providerRegistry } from "./registry.js";
export { registerOpenAIProvider } from "./openai.js";
export { registerAnthropicProvider } from "./anthropic.js";
export { registerChromeProvider, isChromeAIAvailable, createChromeModel } from "./chrome.js";

// Auto-register built-in providers
import { registerOpenAIProvider } from "./openai.js";
import { registerAnthropicProvider } from "./anthropic.js";
import { registerChromeProvider } from "./chrome.js";

registerOpenAIProvider();
registerAnthropicProvider();
registerChromeProvider();
