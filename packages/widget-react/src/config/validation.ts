import { z } from "zod";

/**
 * Model configuration schema
 */
export const ModelConfigSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().optional(),
  name: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

/**
 * Theme configuration schema
 */
export const ThemeConfigSchema = z.object({
  preset: z.enum(["light", "dark", "minimal"]).optional(),
  variables: z.record(z.string()).optional(),
  customCss: z.string().optional(),
});

/**
 * Plugins configuration schema
 */
export const PluginsConfigSchema = z.object({
  mermaid: z.boolean().optional(),
  shiki: z.boolean().optional(),
});

/**
 * Widget UI configuration schema
 */
export const WidgetUIConfigSchema = z.object({
  theme: ThemeConfigSchema.optional(),
  position: z
    .enum(["bottom-right", "bottom-left", "top-right", "top-left"])
    .optional(),
  defaultOpen: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  placeholder: z.string().optional(),
  title: z.string().optional(),
  plugins: PluginsConfigSchema.optional(),
});

/**
 * MCP server configuration schema
 */
export const MCPServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(["http", "stdio"]),
  endpoint: z.string().url().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

/**
 * MCP Apps callbacks schema (functions are validated loosely)
 */
export const MCPAppsCallbacksSchema = z.object({
  onIntent: z.function().optional(),
  onToolCall: z.function().optional(),
  onMessage: z.function().optional(),
  onOpenLink: z.function().optional(),
}).optional();

/**
 * Widget configuration schema
 */
export const WidgetConfigSchema = z.object({
  model: ModelConfigSchema,
  mcps: z.array(MCPServerConfigSchema).optional(),
  policy: z.any().optional(), // Policy is complex, validate loosely
  widget: WidgetUIConfigSchema.optional(),
  threads: z.boolean().optional(),
  initialPrompt: z.string().optional(),
  mcpApps: MCPAppsCallbacksSchema,
});

/**
 * Validate widget configuration
 */
export function validateConfig(config: unknown) {
  return WidgetConfigSchema.parse(config);
}

/**
 * Safe validate (returns result instead of throwing)
 */
export function safeValidateConfig(config: unknown) {
  return WidgetConfigSchema.safeParse(config);
}
