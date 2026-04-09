/**
 * Container execution backend for heavy-duty operations
 *
 * Handles operations that require:
 * - Git cloning
 * - stdio MCP servers
 * - Native binaries
 * - Full Linux environment
 *
 * Implementations:
 * - Docker (Node.js / self-hosted) - Uses child_process with security hardening
 * - Cloudflare Containers (Workers) - Uses HTTP-based sidecar communication
 */

import type {
  ExecutionBackend,
  ExecutionCapabilities,
  ExecuteOptions,
  ExecuteResult,
} from "./interface.js";
import { EXIT_CODES } from "./interface.js";
import type { VFSBackend } from "../vfs/interface.js";

/**
 * Container runtime type
 */
export type ContainerRuntime = "docker" | "cloudflare";

/**
 * Options for the container backend
 */
export interface ContainerBackendOptions {
  /** Container runtime to use */
  runtime: ContainerRuntime;
  /** Docker image to use (for Docker runtime) */
  image?: string;
  /** Cloudflare container binding (for CF runtime) */
  containerBinding?: unknown;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Enable network access (Docker: default false for security) */
  networkEnabled?: boolean;
  /** Network mode when enabled (Docker: bridge, host) */
  networkMode?: "bridge" | "host";
}

/**
 * Container execution request
 */
export interface ContainerRequest {
  /** Command to execute */
  command: string[];
  /** Working directory */
  workdir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum memory in MB */
  memMb?: number;
  /** Files to mount (path -> content) */
  files?: Record<string, Uint8Array>;
}

/**
 * Container execution response
 */
export interface ContainerResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Modified files (path -> content) */
  files?: Record<string, Uint8Array>;
}

/**
 * Container backend interface
 * Different implementations for Docker and Cloudflare Containers
 */
export interface ContainerExecutor {
  execute(request: ContainerRequest): Promise<ContainerResponse>;
  dispose(): Promise<void>;
}

/**
 * Container execution backend
 */
export class ContainerBackend implements ExecutionBackend {
  readonly name = "container";
  readonly capabilities: ExecutionCapabilities = {
    network: true,
    filesystem: true,
    containers: true,
    asyncAwait: true,
    maxConcurrency: 5,
  };

  private executor: ContainerExecutor | null = null;
  private options: ContainerBackendOptions;
  private initialized = false;

  constructor(options: ContainerBackendOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.options.runtime === "docker") {
      this.executor = await this.createDockerExecutor();
    } else if (this.options.runtime === "cloudflare") {
      this.executor = await this.createCloudflareExecutor();
    } else {
      throw new Error(`Unknown container runtime: ${this.options.runtime}`);
    }

    this.initialized = true;
  }

  private async createDockerExecutor(): Promise<ContainerExecutor> {
    return new DockerExecutor({
      image: this.options.image ?? "node:20-alpine",
      verbose: this.options.verbose,
      networkEnabled: this.options.networkEnabled ?? false,
      networkMode: this.options.networkMode ?? "bridge",
    });
  }

  private async createCloudflareExecutor(): Promise<ContainerExecutor> {
    if (!this.options.containerBinding) {
      throw new Error("Cloudflare container binding is required");
    }
    return new CloudflareContainerExecutor({
      binding: this.options.containerBinding,
      verbose: this.options.verbose,
    });
  }

  async execute(code: string, options?: ExecuteOptions): Promise<ExecuteResult> {
    if (!this.executor) {
      throw new Error("Container backend not initialized");
    }

    const startTime = Date.now();
    const limits = options?.limits ?? {};

    // Prepare files to mount
    const files: Record<string, Uint8Array> = {
      "/workspace/index.js": new TextEncoder().encode(code),
    };

    // If VFS is provided, sync files to container
    if (options?.vfs) {
      const vfsFiles = await this.syncFromVFS(options.vfs);
      Object.assign(files, vfsFiles);
    }

    try {
      const response = await this.executor.execute({
        command: ["node", "/workspace/index.js"],
        workdir: "/workspace",
        env: options?.env,
        timeoutMs: limits.timeoutMs ?? 60000,
        memMb: limits.memMb ?? 256,
        files,
      });

      // Sync modified files back to VFS
      if (options?.vfs && response.files) {
        await this.syncToVFS(options.vfs, response.files);
      }

      return {
        exitCode: response.exitCode,
        stdout: response.stdout,
        stderr: response.stderr,
        wallMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        exitCode: EXIT_CODES.ERROR,
        stdout: "",
        stderr: `Container execution error: ${error}`,
        wallMs: Date.now() - startTime,
      };
    }
  }

  async executeFromVFS(
    options: ExecuteOptions & { vfs: VFSBackend; entryPath: string }
  ): Promise<ExecuteResult> {
    const entryData = await options.vfs.read(options.entryPath);
    const code = new TextDecoder().decode(entryData);
    return this.execute(code, options);
  }

  /**
   * Clone a git repository
   */
  async gitClone(
    repoUrl: string,
    targetPath: string,
    options?: { branch?: string; depth?: number }
  ): Promise<ContainerResponse> {
    if (!this.executor) {
      throw new Error("Container backend not initialized");
    }

    const command = ["git", "clone"];
    if (options?.branch) {
      command.push("-b", options.branch);
    }
    if (options?.depth) {
      command.push("--depth", String(options.depth));
    }
    command.push(repoUrl, targetPath);

    return this.executor.execute({
      command,
      timeoutMs: 120000, // 2 minutes for git operations
    });
  }

  /**
   * Run a stdio MCP server
   */
  async runStdioMCP(
    command: string[],
    input: string,
    options?: { env?: Record<string, string>; timeoutMs?: number }
  ): Promise<ContainerResponse> {
    if (!this.executor) {
      throw new Error("Container backend not initialized");
    }

    const files: Record<string, Uint8Array> = {
      "/workspace/input.json": new TextEncoder().encode(input),
    };

    return this.executor.execute({
      command: ["sh", "-c", `cat /workspace/input.json | ${command.join(" ")}`],
      env: options?.env,
      timeoutMs: options?.timeoutMs ?? 30000,
      files,
    });
  }

  private async syncFromVFS(
    vfs: VFSBackend,
    options?: { include?: string[]; exclude?: string[]; maxTotalSize?: number; maxFiles?: number }
  ): Promise<Record<string, Uint8Array>> {
    const files: Record<string, Uint8Array> = {};
    const maxTotalSize = options?.maxTotalSize ?? 50 * 1024 * 1024; // 50MB
    const maxFiles = options?.maxFiles ?? 1000;
    let totalSize = 0;
    let fileCount = 0;

    async function walkDir(path: string): Promise<void> {
      if (fileCount >= maxFiles) return;

      const entries = await vfs.list(path);
      for (const entry of entries) {
        if (fileCount >= maxFiles) break;

        const fullPath = path === "/" ? `/${entry}` : `${path}/${entry}`;

        try {
          const stat = await vfs.stat(fullPath);
          if (stat.isDirectory) {
            await walkDir(fullPath);
          } else {
            // Check size limits
            if (totalSize + stat.size > maxTotalSize) {
              console.warn(`Skipping ${fullPath}: would exceed size limit`);
              continue;
            }

            files[`/workspace${fullPath}`] = await vfs.read(fullPath);
            totalSize += stat.size;
            fileCount++;
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }

    await walkDir("/");
    return files;
  }

  private async syncToVFS(
    vfs: VFSBackend,
    files: Record<string, Uint8Array>
  ): Promise<void> {
    for (const [path, content] of Object.entries(files)) {
      if (path.startsWith("/workspace/")) {
        const vfsPath = path.replace("/workspace", "");
        try {
          await vfs.write(vfsPath, content);
        } catch (error) {
          console.warn(`Failed to sync file ${vfsPath}: ${error}`);
        }
      }
    }
  }

  isReady(): boolean {
    return this.initialized && this.executor !== null;
  }

  async dispose(): Promise<void> {
    if (this.executor) {
      await this.executor.dispose();
      this.executor = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// Docker Executor
// ============================================================================

interface DockerExecutorOptions {
  image: string;
  verbose?: boolean;
  networkEnabled?: boolean;
  networkMode?: "bridge" | "host";
}

/**
 * Docker executor implementation with security hardening
 */
class DockerExecutor implements ContainerExecutor {
  private image: string;
  private verbose: boolean;
  private networkEnabled: boolean;
  private networkMode: string;

  constructor(options: DockerExecutorOptions) {
    this.image = options.image;
    this.verbose = options.verbose ?? false;
    this.networkEnabled = options.networkEnabled ?? false;
    this.networkMode = options.networkMode ?? "bridge";
  }

  async execute(request: ContainerRequest): Promise<ContainerResponse> {
    // Validate request
    this.validateRequest(request);

    // Dynamic import for Node.js modules
    const { spawn } = await import("node:child_process");
    const { writeFile, mkdir, readFile, readdir, stat, mkdtemp, rm } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const { tmpdir } = await import("node:os");

    // Create temporary directory for files
    const tempDir = await mkdtemp(join(tmpdir(), "container-"));

    try {
      // Write input files to temp directory
      await this.writeInputFiles(tempDir, request.files, { writeFile, mkdir, dirname, join });

      // Build docker run command with security hardening
      const dockerArgs = this.buildDockerArgs(tempDir, request);

      if (this.verbose) {
        console.log("[Docker] Running:", "docker", dockerArgs.join(" "));
      }

      // Execute with timeout and output limits
      const result = await this.runDocker(spawn, dockerArgs, request.timeoutMs);

      // Read back modified files from container
      const outputFiles = await this.readOutputFiles(tempDir, { readFile, readdir, stat, join });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        files: outputFiles,
      };
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Validate container request for security
   */
  private validateRequest(request: ContainerRequest): void {
    // Validate command arguments
    for (const arg of request.command) {
      if (typeof arg !== "string") {
        throw new Error("Command arguments must be strings");
      }
    }

    // Validate environment variable names
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          throw new Error(`Invalid environment variable name: ${key}`);
        }
        if (typeof value !== "string") {
          throw new Error(`Environment variable value must be string: ${key}`);
        }
      }
    }

    // Validate file paths
    if (request.files) {
      for (const path of Object.keys(request.files)) {
        if (path.includes("..") || !path.startsWith("/")) {
          throw new Error(`Invalid file path: ${path}`);
        }
      }
    }

    // Validate limits
    if (request.timeoutMs !== undefined && (request.timeoutMs < 1000 || request.timeoutMs > 300000)) {
      throw new Error("Timeout must be between 1s and 5m");
    }
    if (request.memMb !== undefined && (request.memMb < 32 || request.memMb > 4096)) {
      throw new Error("Memory must be between 32MB and 4GB");
    }
  }

  /**
   * Write input files to temp directory
   */
  private async writeInputFiles(
    tempDir: string,
    files: Record<string, Uint8Array> | undefined,
    fs: { writeFile: typeof import("node:fs/promises").writeFile; mkdir: typeof import("node:fs/promises").mkdir; dirname: typeof import("node:path").dirname; join: typeof import("node:path").join }
  ): Promise<void> {
    if (!files) return;

    for (const [path, content] of Object.entries(files)) {
      // Convert container path to temp dir path
      // e.g., /workspace/index.js -> {tempDir}/workspace/index.js
      const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
      const fullPath = fs.join(tempDir, normalizedPath);

      // Create parent directories
      await fs.mkdir(fs.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }
  }

  /**
   * Build Docker command arguments with security hardening
   */
  private buildDockerArgs(tempDir: string, request: ContainerRequest): string[] {
    const workdir = request.workdir ?? "/workspace";
    const memMb = request.memMb ?? 256;

    const args = [
      "run",
      "--rm",                                    // Auto-remove container
      "--init",                                  // Use tini for proper signal handling
      "-v", `${tempDir}:${tempDir}:rw`,          // Mount temp directory
      "-w", workdir.startsWith("/workspace") ? `${tempDir}${workdir.slice(0)}` : workdir,
      `--memory=${memMb}m`,                      // Memory limit
      `--memory-swap=${memMb}m`,                 // Prevent swap
      "--pids-limit=100",                        // Prevent fork bombs
      "--ulimit", "nofile=1024:1024",            // File descriptor limit
      "--security-opt=no-new-privileges",        // Security hardening
      "--read-only",                             // Read-only root filesystem
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", // Writable tmp
    ];

    // Network configuration
    if (!this.networkEnabled) {
      args.push("--network=none");
    } else {
      args.push(`--network=${this.networkMode}`);
    }

    // Environment variables
    if (request.env) {
      for (const [key, value] of Object.entries(request.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Image and command
    args.push(this.image);

    // Adjust command paths to use temp directory
    const adjustedCommand = request.command.map(arg => {
      if (arg.startsWith("/workspace")) {
        return `${tempDir}${arg}`;
      }
      return arg;
    });
    args.push(...adjustedCommand);

    return args;
  }

  /**
   * Run Docker with timeout and output limits
   */
  private async runDocker(
    spawn: typeof import("node:child_process").spawn,
    args: string[],
    timeoutMs?: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let killed = false;
      const timeout = timeoutMs ?? 60000;
      const maxOutputSize = 1024 * 1024; // 1MB per stream

      // Set up timeout
      const timer = setTimeout(() => {
        killed = true;
        proc.kill("SIGKILL");
      }, timeout);

      // Collect stdout with size limit
      proc.stdout.on("data", (data: Buffer) => {
        if (stdout.length < maxOutputSize) {
          stdout += data.toString().slice(0, maxOutputSize - stdout.length);
        }
      });

      // Collect stderr with size limit
      proc.stderr.on("data", (data: Buffer) => {
        if (stderr.length < maxOutputSize) {
          stderr += data.toString().slice(0, maxOutputSize - stderr.length);
        }
      });

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: killed ? EXIT_CODES.TIMEOUT : (code ?? 1),
          stdout,
          stderr: killed ? `${stderr}\nProcess killed after ${timeout}ms timeout` : stderr,
        });
      });

      proc.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          exitCode: EXIT_CODES.ERROR,
          stdout: "",
          stderr: `Docker execution error: ${error.message}`,
        });
      });
    });
  }

  /**
   * Read output files from temp directory
   */
  private async readOutputFiles(
    tempDir: string,
    fs: { readFile: typeof import("node:fs/promises").readFile; readdir: typeof import("node:fs/promises").readdir; stat: typeof import("node:fs/promises").stat; join: typeof import("node:path").join }
  ): Promise<Record<string, Uint8Array>> {
    const output: Record<string, Uint8Array> = {};

    async function walk(dir: string, prefix: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = fs.join(dir, entry.name);
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            await walk(fullPath, relativePath);
          } else if (entry.isFile()) {
            try {
              const content = await fs.readFile(fullPath);
              // Use workspace path as key
              output[`/${relativePath}`] = new Uint8Array(content);
            } catch {
              // Skip unreadable files
            }
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    await walk(tempDir, "");
    return output;
  }

  async dispose(): Promise<void> {
    // No cleanup needed for Docker executor
  }
}

// ============================================================================
// Cloudflare Container Executor
// ============================================================================

interface CloudflareContainerExecutorOptions {
  binding: unknown;
  verbose?: boolean;
}

/**
 * Cloudflare Container executor implementation
 *
 * CF Containers are HTTP-based services, not batch executors.
 * This communicates with a sidecar HTTP service running inside the container.
 *
 * Expected sidecar API:
 * POST /execute
 * Body: { command, workdir, env, timeoutMs, files (base64 encoded) }
 * Response: { exitCode, stdout, stderr, files (base64 encoded) }
 */
class CloudflareContainerExecutor implements ContainerExecutor {
  private binding: unknown;
  private verbose: boolean;

  constructor(options: CloudflareContainerExecutorOptions) {
    this.binding = options.binding;
    this.verbose = options.verbose ?? false;
  }

  async execute(request: ContainerRequest): Promise<ContainerResponse> {
    // Get container stub from binding
    const container = this.binding as {
      fetch(request: Request): Promise<Response>;
    };

    if (!container || typeof container.fetch !== "function") {
      return {
        exitCode: EXIT_CODES.ERROR,
        stdout: "",
        stderr: "Invalid container binding: expected fetch method",
      };
    }

    // Encode files as base64 for JSON transport
    const encodedFiles: Record<string, string> | undefined = request.files
      ? Object.fromEntries(
          Object.entries(request.files).map(([path, content]) => [
            path,
            this.encodeBase64(content),
          ])
        )
      : undefined;

    if (this.verbose) {
      console.log("[CF Container] Executing:", request.command.join(" "));
    }

    try {
      // Make HTTP request to container sidecar
      const response = await container.fetch(
        new Request("http://container/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: request.command,
            workdir: request.workdir,
            env: request.env,
            timeoutMs: request.timeoutMs,
            files: encodedFiles,
          }),
        })
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          exitCode: EXIT_CODES.ERROR,
          stdout: "",
          stderr: `Container HTTP error: ${response.status} - ${errorText}`,
        };
      }

      const result = (await response.json()) as {
        exitCode: number;
        stdout: string;
        stderr: string;
        files?: Record<string, string>;
      };

      // Decode files from base64
      const decodedFiles: Record<string, Uint8Array> | undefined = result.files
        ? Object.fromEntries(
            Object.entries(result.files).map(([path, base64]) => [
              path,
              this.decodeBase64(base64),
            ])
          )
        : undefined;

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        files: decodedFiles,
      };
    } catch (error) {
      return {
        exitCode: EXIT_CODES.ERROR,
        stdout: "",
        stderr: `Container execution error: ${error}`,
      };
    }
  }

  private encodeBase64(data: Uint8Array): string {
    // Browser/Workers compatible base64 encoding
    const binaryString = Array.from(data, (byte) =>
      String.fromCharCode(byte)
    ).join("");
    return btoa(binaryString);
  }

  private decodeBase64(base64: string): Uint8Array {
    // Browser/Workers compatible base64 decoding
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async dispose(): Promise<void> {
    // Cloudflare manages container lifecycle
  }
}

/**
 * Create a container execution backend
 */
export async function createContainerBackend(
  options: ContainerBackendOptions
): Promise<ContainerBackend> {
  const backend = new ContainerBackend(options);
  await backend.initialize();
  return backend;
}
