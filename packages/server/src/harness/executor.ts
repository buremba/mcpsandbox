/**
 * Node harness executor - runs capsules server-side using V8 Isolates
 * Uses isolated-vm for fast, secure JavaScript execution with full ES6+ support
 */

import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { Capsule } from "@onemcp/shared";
import { QuickJSRuntime } from "./quickjs-runtime.js";
import { NodeVirtualFilesystem } from "../vfs/node-vfs.js";
import { FilesystemPolicyEnforcer } from "../policy/filesystem.js";
import type { FilesystemPolicy, MCPServerConfig } from "@onemcp/shared";
import type { MCPManager } from "../services/mcp-manager.js";

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  wallMs: number;
  lastValue?: string; // Last expression result (REPL-style)
}

export class NodeExecutor {
  constructor(
    private cacheDir: string,
    private defaultFilesystemPolicy?: FilesystemPolicy,
    private mcpManager?: MCPManager,
    private mcpConfigs?: MCPServerConfig[]
  ) {}

  async initialize() {
    // No initialization needed for V8 Isolates (instant startup)
  }

  async executeCapsule(capsuleHash: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Load capsule manifest
    const capsuleDir = join(this.cacheDir, capsuleHash);
    const capsuleJson = await readFile(
      join(capsuleDir, "capsule.json"),
      "utf-8"
    );
    const capsule: Capsule = JSON.parse(capsuleJson);

    // Create workspace directory
    const capsuleWorkDir = join(capsuleDir, 'workspace');
    await mkdir(capsuleWorkDir, { recursive: true });

    // Load code layer
    const codeZip = await readFile(join(capsuleDir, "fs.code.zip"));
    const codeFiles = unzipSync(codeZip);

    // Extract mount layers to their target directories
    for (const layer of capsule.fsLayers) {
      if (layer.target && layer.id !== "code") {
        // This is a mount layer
        const mountZipPath = join(capsuleDir, layer.path);
        const mountZip = await readFile(mountZipPath);
        const mountFiles = unzipSync(mountZip);

        // Extract files to target directory
        const targetDir = join(capsuleWorkDir, layer.target);
        await mkdir(targetDir, { recursive: true });

        for (const [filePath, fileData] of Object.entries(mountFiles)) {
          const fullPath = join(targetDir, filePath);
          const fileDir = join(fullPath, '..');
          await mkdir(fileDir, { recursive: true });

          // Write file using streams for better memory efficiency
          const readable = Readable.from(Buffer.from(fileData));
          const writable = createWriteStream(fullPath);
          await pipeline(readable, writable);
        }
      }
    }

    // Get entry file
    const entryPath = capsule.entry.path.replace(/^\//, ""); // Remove leading slash
    const entryCode = codeFiles[entryPath];
    if (!entryCode) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }

    const code = new TextDecoder().decode(entryCode);

    // Capture stdout/stderr with size limits
    const maxStdoutBytes = capsule.policy?.limits?.stdoutBytes || 1048576; // 1MB default
    let stdout = "";
    let stderr = "";
    const onStdout = (chunk: string) => {
      stdout += chunk;
      // Enforce stdout size limit
      if (Buffer.byteLength(stdout, 'utf8') > maxStdoutBytes) {
        throw new Error(`Stdout size limit exceeded (${maxStdoutBytes} bytes)`);
      }
    };
    const onStderr = (chunk: string) => {
      stderr += chunk;
      // Allow stderr to grow slightly more for error messages
      if (Buffer.byteLength(stderr, 'utf8') > maxStdoutBytes * 2) {
        throw new Error(`Stderr size limit exceeded`);
      }
    };

    // Execute with QuickJS runtime (temporarily until isolated-vm Node v25 compatibility is resolved)
    if (capsule.language !== "js") {
      throw new Error(`Unsupported language: ${capsule.language}. Only JavaScript is supported.`);
    }

    // Create VFS for this execution
    const filesystemPolicy = capsule.policy?.filesystem || this.defaultFilesystemPolicy || {
      readonly: ['/'],
      writable: ['/tmp', '/out']
    };

    const policyEnforcer = new FilesystemPolicyEnforcer(filesystemPolicy);
    const vfs = new NodeVirtualFilesystem({
      baseDir: capsuleWorkDir,
      policy: policyEnforcer
    });

    const runtime = new QuickJSRuntime(vfs, this.mcpManager, this.mcpConfigs);
    const result = await runtime.execute(code, capsule, onStdout, onStderr);

    const wallMs = Date.now() - startTime;

    return {
      exitCode: result.exitCode,
      stdout,
      stderr,
      wallMs,
      lastValue: result.lastValue,
    };
  }

  dispose() {
    // No cleanup needed
  }
}
