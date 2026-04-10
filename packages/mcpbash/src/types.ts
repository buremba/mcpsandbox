import type { ExecOptions, IFileSystem, BashOptions } from "just-bash";

export interface SecretEnvRef {
  readonly kind: "env";
  readonly name: string;
}

export type SecretRef = SecretEnvRef;
export type EnvValue = string | SecretRef;
export type TemplateValue = unknown;

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type SandboxRunOptions = Pick<
  ExecOptions,
  "cwd" | "stdin" | "env" | "replaceEnv" | "rawScript" | "signal" | "args"
>;

export interface SandboxFsApi {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  list(path?: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export interface SandboxGitApi {
  status(args?: string[]): Promise<SandboxResult>;
  diff(args?: string[]): Promise<SandboxResult>;
  log(args?: string[]): Promise<SandboxResult>;
}

export interface SandboxCommandContext {
  cwd: string;
  stdin: string;
  args: string[];
  env: Record<string, string>;
  fs: SandboxFsApi;
  run(command: string, options?: SandboxRunOptions): Promise<SandboxResult>;
}

export interface Sandbox {
  readonly root: string;
  readonly fs: SandboxFsApi;
  readonly git?: SandboxGitApi;
  run(command: string, options?: SandboxRunOptions): Promise<SandboxResult>;
  commands(): string[];
  dispose(): Promise<void>;
}

export interface FilesystemConfig {
  mode?: "memory" | "readonly" | "readwrite";
  root?: string;
  allow?: string[];
  deny?: string[];
  maxFileReadSize?: number;
  allowSymlinks?: boolean;
}

export interface SandboxNetworkConfig {
  allow?: string[];
  methods?: Array<"GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE">;
  blockAllElse?: boolean;
}

export interface SandboxIntegrationsConfig {
  git?: boolean;
}

export type SandboxBashConfig = Omit<
  BashOptions,
  "fs" | "files" | "env" | "cwd" | "network" | "customCommands"
>;

export interface McpToolInvocation {
  server: string;
  tool: string;
  input: unknown;
  headers: Record<string, string>;
  env: Record<string, string>;
  signal?: AbortSignal;
}

export type McpToolInvoker = (
  invocation: McpToolInvocation
) => Promise<unknown>;

export interface SandboxConfig {
  name?: string;
  filesystem?: FilesystemConfig;
  network?: SandboxNetworkConfig;
  bash?: SandboxBashConfig;
  integrations?: SandboxIntegrationsConfig;
  env?: Record<string, EnvValue>;
  commands?: Record<string, SandboxCommandBinding>;
  mcp?: {
    invokeTool?: McpToolInvoker;
  };
}

export interface McpCommandOptions {
  server: string;
  tool: string;
  input?: TemplateValue;
  headers?: Record<string, string | SecretRef>;
  env?: Record<string, EnvValue>;
  description?: string;
}

export interface FnCommandOptions<TInput = Record<string, unknown>> {
  input?: TemplateValue;
  env?: Record<string, EnvValue>;
  description?: string;
  handler(
    input: TInput,
    context: SandboxCommandContext
  ): Promise<unknown> | unknown;
}

export interface CliCommandOptions {
  command: string;
  args?: string[];
  env?: Record<string, EnvValue>;
  description?: string;
}

export interface McpCommandBinding {
  kind: "mcp";
  options: McpCommandOptions;
}

export interface FnCommandBinding<TInput = Record<string, unknown>> {
  kind: "fn";
  options: FnCommandOptions<TInput>;
}

export interface CliCommandBinding {
  kind: "cli";
  options: CliCommandOptions;
}

export type SandboxCommandBinding =
  | McpCommandBinding
  | FnCommandBinding
  | CliCommandBinding;

export interface SandboxRuntimeConfig {
  fs: IFileSystem;
  publicEnv: Record<string, string>;
  secretEnv: Record<string, SecretRef>;
}
