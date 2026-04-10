import fs from "node:fs";
import path from "node:path";
import { Bash, InMemoryFs, OverlayFs, ReadWriteFs, defineCommand } from "just-bash";
import type { CommandContext, CustomCommand, IFileSystem } from "just-bash";
import { PolicyFileSystem } from "./policy-fs";
import { runHostCommand } from "./process";
import { isSecretRef } from "./secrets";
import { toRealPath, toVirtualPath } from "./path-utils";
import { resolveTemplateValue } from "./templates";
import type {
  CliCommandBinding,
  EnvValue,
  FilesystemConfig,
  FnCommandBinding,
  McpCommandBinding,
  McpToolInvocation,
  McpToolInvoker,
  Sandbox,
  SandboxCommandBinding,
  SandboxCommandContext,
  SandboxConfig,
  SandboxFsApi,
  SandboxGitApi,
  SandboxRunOptions,
  SandboxResult,
  SecretRef,
} from "./types";

const DEFAULT_ALLOW_PATTERNS = ["**"];
const DEFAULT_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;
const BASE_HOST_ENV = {
  PATH: process.env.PATH ?? "",
  HOME: process.env.HOME ?? "",
  TMPDIR: process.env.TMPDIR ?? "",
};

function splitEnvironment(env: Record<string, EnvValue> | undefined): {
  publicEnv: Record<string, string>;
  secretEnv: Record<string, SecretRef>;
} {
  const publicEnv: Record<string, string> = {};
  const secretEnv: Record<string, SecretRef> = {};

  for (const [key, value] of Object.entries(env ?? {})) {
    if (isSecretRef(value)) {
      secretEnv[key] = value;
    } else {
      publicEnv[key] = value;
    }
  }

  return { publicEnv, secretEnv };
}

function resolveEnvValues(env: Record<string, EnvValue> | undefined): {
  values: Record<string, string>;
  secrets: string[];
} {
  const values: Record<string, string> = {};
  const secrets: string[] = [];

  for (const [key, value] of Object.entries(env ?? {})) {
    if (isSecretRef(value)) {
      const resolved = process.env[value.name];
      if (resolved === undefined) {
        throw new Error(`Missing required secret environment variable ${value.name}`);
      }
      values[key] = resolved;
      if (resolved.length > 0) {
        secrets.push(resolved);
      }
      continue;
    }

    values[key] = value;
  }

  return { values, secrets };
}

function redactText(text: string, secrets: string[]): string {
  let output = text;
  for (const secret of secrets) {
    if (!secret) {
      continue;
    }
    output = output.split(secret).join("[REDACTED]");
  }
  return output;
}

function sanitizeResult(result: SandboxResult, secrets: string[]): SandboxResult {
  return {
    stdout: redactText(result.stdout, secrets),
    stderr: redactText(result.stderr, secrets),
    exitCode: result.exitCode,
  };
}

function normalizeResult(value: unknown): SandboxResult {
  if (
    value &&
    typeof value === "object" &&
    "stdout" in value &&
    "stderr" in value &&
    "exitCode" in value
  ) {
    const result = value as {
      stdout?: unknown;
      stderr?: unknown;
      exitCode?: unknown;
    };
    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
      exitCode: Number(result.exitCode ?? 0),
    };
  }

  if (typeof value === "string") {
    return { stdout: value, stderr: "", exitCode: 0 };
  }

  if (value instanceof Uint8Array) {
    return {
      stdout: Buffer.from(value).toString("utf8"),
      stderr: "",
      exitCode: 0,
    };
  }

  if (value === undefined || value === null) {
    return { stdout: "", stderr: "", exitCode: 0 };
  }

  return {
    stdout: `${JSON.stringify(value, null, 2)}\n`,
    stderr: "",
    exitCode: 0,
  };
}

function createFileSystem(
  root: string,
  config: FilesystemConfig
): { fs: IFileSystem } {
  const mode = config.mode ?? "readwrite";
  const allowPatterns = config.allow ?? DEFAULT_ALLOW_PATTERNS;
  const denyPatterns = config.deny ?? [];

  const baseFs =
    mode === "memory"
      ? new InMemoryFs()
      : mode === "readonly"
        ? new OverlayFs({
            root,
            mountPoint: "/",
            readOnly: true,
            maxFileReadSize: config.maxFileReadSize,
            allowSymlinks: config.allowSymlinks,
          })
        : new ReadWriteFs({
            root,
            maxFileReadSize: config.maxFileReadSize,
            allowSymlinks: config.allowSymlinks,
          });

  return {
    fs: new PolicyFileSystem(baseFs, allowPatterns, denyPatterns),
  };
}

function hostAllowed(hostname: string, allowList: string[]): boolean {
  return allowList.some(
    (domain) =>
      hostname === domain ||
      (domain.startsWith(".") && hostname.endsWith(domain.slice(1)))
  );
}

function isUrlPrefix(value: string): boolean {
  return value.includes("://");
}

function toAllowedUrlPrefixes(allowList: string[]): string[] {
  return allowList.flatMap((entry) => {
    if (isUrlPrefix(entry)) {
      return [entry];
    }

    return [`https://${entry}/`, `http://${entry}/`];
  });
}

function networkEntryMatchesUrl(url: URL, entry: string): boolean {
  if (isUrlPrefix(entry)) {
    return url.href.startsWith(entry);
  }

  return (
    url.hostname === entry ||
    (entry.startsWith(".") && url.hostname.endsWith(entry.slice(1)))
  );
}

export async function defaultHttpMcpInvoker(
  invocation: McpToolInvocation
): Promise<unknown> {
  const server = invocation.server.endsWith("/")
    ? invocation.server
    : `${invocation.server}/`;
  const url = new URL(`tools/${encodeURIComponent(invocation.tool)}`, server);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...invocation.headers,
    },
    body: JSON.stringify({ input: invocation.input }),
    signal: invocation.signal,
  });

  const text = await response.text();
  if (!response.ok) {
    return {
      stdout: "",
      stderr: text || `MCP call failed with status ${response.status}`,
      exitCode: 1,
    };
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "result" in parsed) {
      return parsed.result;
    }
    return parsed;
  }

  return text;
}

class SandboxFs implements SandboxFsApi {
  constructor(private readonly fs: IFileSystem) {}

  async read(targetPath: string): Promise<string> {
    return this.fs.readFile(toVirtualPath(targetPath), "utf8");
  }

  async write(targetPath: string, content: string): Promise<void> {
    await this.fs.writeFile(toVirtualPath(targetPath), content, "utf8");
  }

  async list(targetPath = "/"): Promise<string[]> {
    return this.fs.readdir(toVirtualPath(targetPath));
  }

  async exists(targetPath: string): Promise<boolean> {
    return this.fs.exists(toVirtualPath(targetPath));
  }
}

class SandboxGit implements SandboxGitApi {
  constructor(
    private readonly root: string,
    private readonly env: Record<string, string>
  ) {}

  private async runGit(args: string[]): Promise<SandboxResult> {
    return runHostCommand({
      command: "git",
      args,
      cwd: this.root,
      env: this.env,
    });
  }

  status(args: string[] = []) {
    return this.runGit(["status", ...args]);
  }

  diff(args: string[] = []) {
    return this.runGit(["diff", ...args]);
  }

  log(args: string[] = []) {
    return this.runGit(["log", ...args]);
  }
}

class McpSandboxImpl implements Sandbox {
  readonly root: string;
  readonly fs: SandboxFsApi;
  readonly git?: SandboxGitApi;

  private readonly bash: Bash;
  private readonly availableCommands: string[];
  private readonly publicEnv: Record<string, string>;
  private readonly secretEnv: Record<string, SecretRef>;
  private readonly mcpInvoker: McpToolInvoker;
  private readonly networkAllowList: string[];
  private readonly blockAllNetwork: boolean;
  private disposed = false;

  constructor(config: SandboxConfig) {
    const filesystemConfig = config.filesystem ?? {};
    const filesystemMode = filesystemConfig.mode ?? "readwrite";
    const root = path.resolve(filesystemConfig.root ?? process.cwd());
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }

    if (filesystemMode === "memory" && config.integrations?.git) {
      throw new Error(
        "integrations.git is not supported with filesystem.mode='memory'"
      );
    }

    this.root = root;
    const env = splitEnvironment(config.env);
    this.publicEnv = env.publicEnv;
    this.secretEnv = env.secretEnv;
    this.mcpInvoker = config.mcp?.invokeTool ?? defaultHttpMcpInvoker;
    this.networkAllowList = config.network?.allow ?? [];
    this.blockAllNetwork =
      config.network?.blockAllElse === true && this.networkAllowList.length === 0;

    const fileSystem = createFileSystem(root, filesystemConfig);
    this.fs = new SandboxFs(fileSystem.fs);

    const customCommands = this.createCustomCommands(config.commands ?? {});
    this.availableCommands = customCommands.map((command) => command.name);

    if (config.integrations?.git) {
      customCommands.push(this.createGitCommand());
      this.availableCommands.push("git");
      this.git = new SandboxGit(root, { ...BASE_HOST_ENV, ...this.publicEnv });
    }

    const network =
      this.networkAllowList.length > 0
        ? {
            allowedUrlPrefixes: toAllowedUrlPrefixes(this.networkAllowList),
            allowedMethods: config.network?.methods ?? [...DEFAULT_METHODS],
          }
        : undefined;

    this.bash = new Bash({
      ...(config.bash ?? {}),
      fs: fileSystem.fs,
      cwd: "/",
      env: this.publicEnv,
      customCommands,
      ...(network && { network }),
    });
  }

  commands(): string[] {
    return [...this.availableCommands].sort();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  async run(command: string, options?: SandboxRunOptions) {
    if (this.disposed) {
      throw new Error("Sandbox has been disposed");
    }

    const result = await this.bash.exec(command, {
      cwd: options?.cwd ? toVirtualPath(options.cwd) : "/",
      stdin: options?.stdin,
      env: options?.env,
      replaceEnv: options?.replaceEnv,
      rawScript: options?.rawScript,
      signal: options?.signal,
      args: options?.args,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  private createCustomCommands(
    bindings: Record<string, SandboxCommandBinding>
  ): CustomCommand[] {
    return Object.entries(bindings).map(([name, binding]) =>
      defineCommand(name, async (args, context) => {
        if (binding.kind === "cli") {
          return this.runCliBinding(binding, args, context);
        }
        if (binding.kind === "fn") {
          return this.runFnBinding(binding, args, context);
        }
        return this.runMcpBinding(binding, args, context);
      })
    );
  }

  private createGitCommand(): CustomCommand {
    const binding: CliCommandBinding = {
      kind: "cli",
      options: {
        command: "git",
        args: ["$*"],
      },
    };

    return defineCommand("git", async (args, context) =>
      this.runCliBinding(binding, args, context)
    );
  }

  private resolveCommandEnvironment(
    bindingEnv: Record<string, EnvValue> | undefined
  ): { env: Record<string, string>; secrets: string[] } {
    const globalSecrets = resolveEnvValues(this.secretEnv);
    const local = resolveEnvValues(bindingEnv);

    return {
      env: {
        ...BASE_HOST_ENV,
        ...this.publicEnv,
        ...globalSecrets.values,
        ...local.values,
      },
      secrets: [...globalSecrets.secrets, ...local.secrets],
    };
  }

  private buildCommandContext(
    args: string[],
    context: CommandContext,
    env: Record<string, string>
  ): SandboxCommandContext {
    return {
      cwd: context.cwd,
      stdin: context.stdin,
      args,
      env,
      fs: this.fs,
      run: (command, options) => this.run(command, options),
    };
  }

  private async runCliBinding(
    binding: CliCommandBinding,
    args: string[],
    context: CommandContext
  ): Promise<SandboxResult> {
    const renderedArgs = resolveTemplateValue(
      binding.options.args ?? ["$*"],
      args
    );
    if (!Array.isArray(renderedArgs)) {
      throw new Error("CLI command args must resolve to an array");
    }

    const commandEnv = this.resolveCommandEnvironment(binding.options.env);
    const result = await runHostCommand({
      command: binding.options.command,
      args: renderedArgs.map((value) => String(value)),
      cwd: toRealPath(this.root, context.cwd),
      env: commandEnv.env,
      stdin: context.stdin,
      signal: context.signal,
    });

    return sanitizeResult(result, commandEnv.secrets);
  }

  private async runFnBinding(
    binding: FnCommandBinding,
    args: string[],
    context: CommandContext
  ): Promise<SandboxResult> {
    const commandEnv = this.resolveCommandEnvironment(binding.options.env);
    const input = resolveTemplateValue(binding.options.input ?? { args: "$*" }, args);

    try {
      const result = await binding.options.handler(
        input as Record<string, unknown>,
        this.buildCommandContext(args, context, commandEnv.env)
      );

      return sanitizeResult(normalizeResult(result), commandEnv.secrets);
    } catch (error) {
      return sanitizeResult(
        {
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        },
        commandEnv.secrets
      );
    }
  }

  private async runMcpBinding(
    binding: McpCommandBinding,
    args: string[],
    context: CommandContext
  ): Promise<SandboxResult> {
    const commandEnv = this.resolveCommandEnvironment(binding.options.env);
    const headers: Record<string, string> = {};
    const headerSecrets: string[] = [];

    try {
      if (this.blockAllNetwork) {
        throw new Error("Sandbox network policy blocks all outbound MCP calls");
      }

      const serverUrl = new URL(binding.options.server);
      if (
        this.networkAllowList.length > 0 &&
        !this.networkAllowList.some((entry) => networkEntryMatchesUrl(serverUrl, entry))
      ) {
        throw new Error(
          `MCP host ${serverUrl.hostname} is blocked by sandbox network policy`
        );
      }

      for (const [key, value] of Object.entries(binding.options.headers ?? {})) {
        if (isSecretRef(value)) {
          const resolved = process.env[value.name];
          if (resolved === undefined) {
            throw new Error(
              `Missing required secret environment variable ${value.name}`
            );
          }
          headers[key] = resolved;
          headerSecrets.push(resolved);
          continue;
        }

        headers[key] = String(resolveTemplateValue(value, args) ?? "");
      }

      const response = await this.mcpInvoker({
        server: binding.options.server,
        tool: binding.options.tool,
        input: resolveTemplateValue(binding.options.input ?? { args: "$*" }, args),
        headers,
        env: commandEnv.env,
        signal: context.signal,
      });

      return sanitizeResult(
        normalizeResult(response),
        [...commandEnv.secrets, ...headerSecrets]
      );
    } catch (error) {
      return sanitizeResult(
        {
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        },
        [...commandEnv.secrets, ...headerSecrets]
      );
    }
  }
}

export async function createSandbox(config: SandboxConfig = {}): Promise<Sandbox> {
  return new McpSandboxImpl(config);
}
