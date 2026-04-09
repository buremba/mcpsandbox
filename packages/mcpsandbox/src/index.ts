import type {
  CliCommandBinding,
  CliCommandOptions,
  FnCommandBinding,
  FnCommandOptions,
  McpCommandBinding,
  McpCommandOptions,
} from "./types";

export { createSandbox, defaultHttpMcpInvoker } from "./sandbox";
export { secret } from "./secrets";
export type {
  CliCommandBinding,
  CliCommandOptions,
  EnvValue,
  FilesystemConfig,
  FnCommandBinding,
  FnCommandOptions,
  McpCommandBinding,
  McpCommandOptions,
  McpToolInvocation,
  McpToolInvoker,
  Sandbox,
  SandboxBashConfig,
  SandboxCommandBinding,
  SandboxCommandContext,
  SandboxConfig,
  SandboxFsApi,
  SandboxGitApi,
  SandboxIntegrationsConfig,
  SandboxNetworkConfig,
  SandboxRunOptions,
  SandboxResult,
  SecretRef,
  TemplateValue,
} from "./types";

export function mcp(options: McpCommandOptions): McpCommandBinding {
  return { kind: "mcp", options };
}

export function fn<TInput = Record<string, unknown>>(
  options: FnCommandOptions<TInput>
): FnCommandBinding<TInput> {
  return { kind: "fn", options };
}

export function cli(options: CliCommandOptions): CliCommandBinding {
  return {
    kind: "cli",
    options: {
      ...options,
      args: options.args ?? ["$*"],
    },
  };
}

export function provider(options: CliCommandOptions): CliCommandBinding {
  return cli(options);
}
