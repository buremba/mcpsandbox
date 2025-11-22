/**
 * Capsule builder - creates signed execution artifacts (spec §6)
 */

import { build as esbuild } from "esbuild";
import { zip } from "fflate";
import { SignJWT, importPKCS8, type KeyLike } from "jose";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { promisify } from "node:util";
import { constants } from "node:fs";
import type {
  Capsule,
  Policy,
  RunJsParams,
  FSLayer,
} from "@onemcp/shared";
import { intersectPolicies } from "../policy/intersection.js";
import { MountLayerBuilder } from "./mount-builder.js";
import type { Logger } from "pino";

const zipAsync = promisify(zip);

export interface BuildOptions {
  cacheDir: string;
  keyPath: string;
  policy: Policy;
  logger?: Logger;
}

export class CapsuleBuilder {
  private privateKey: KeyLike | null = null;
  private buildCache = new Map<string, string>(); // cacheKey → bundled code
  private readonly MAX_CACHE_SIZE = 1000; // LRU eviction after 1000 entries
  private mountBuilder: MountLayerBuilder;

  constructor(private options: BuildOptions) {
    this.mountBuilder = new MountLayerBuilder(options.logger);
  }

  async initialize() {
    const keyPem = await readFile(this.options.keyPath, "utf-8");
    this.privateKey = await importPKCS8(keyPem, "EdDSA");
  }

  async dispose() {
    // Cleanup if needed
  }

  /**
   * Build capsule from run_js request
   */
  async buildJsCapsule(params: RunJsParams): Promise<string> {
    // Generate build cache key from code + npm dependencies
    const cacheKey = this.getBuildCacheKey(params);

    // Check build cache (skip expensive esbuild if cached)
    let bundledCode = this.buildCache.get(cacheKey);

    if (!bundledCode) {
      // Cache miss: run esbuild
      let bundleResult;
      try {
        bundleResult = await esbuild({
          stdin: {
            contents: params.code,
            loader: "js",
            resolveDir: process.cwd(),
          },
          bundle: true,
          format: "iife", // QuickJS doesn't support ESM, use IIFE
          target: "es2020", // Target ES2020 for QuickJS compatibility
          platform: "neutral",
          write: false,
          external: params.npm ? Object.keys(params.npm.dependencies) : [],
          logLevel: "silent", // Suppress esbuild logs
        });
      } catch (error) {
        throw new Error(`esbuild failed: ${error}`);
      }

      if (bundleResult.errors.length > 0) {
        throw new Error(`esbuild failed: ${bundleResult.errors[0]?.text}`);
      }

      bundledCode = bundleResult.outputFiles?.[0]?.text || "";

      // Store in cache with LRU eviction
      this.buildCache.set(cacheKey, bundledCode);
      if (this.buildCache.size > this.MAX_CACHE_SIZE) {
        // Remove oldest entry (first key in Map)
        const firstKey = this.buildCache.keys().next().value;
        if (firstKey) {
          this.buildCache.delete(firstKey);
        }
      }
    }

    // Generate entry.js (spec §6)
    // For now, inline the shims instead of importing them
    const entryJs = `
// Runtime shims - inline for QuickJS compatibility
const shimConsole = {
  log: (...args) => console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => console.log(...args),
  info: (...args) => console.log(...args)
};

// Make console available globally if not already defined
if (typeof globalThis.console === 'undefined') {
  globalThis.console = shimConsole;
}

// Execute the bundled code
${bundledCode}
`.trim();

    // Create code layer
    const codeFiles: Record<string, Uint8Array> = {
      "entry.js": new TextEncoder().encode(entryJs),
    };

    // Add stdin if provided
    if (params.stdin) {
      codeFiles["_stdin.txt"] = new TextEncoder().encode(params.stdin);
    }

    const codeZip = await zipAsync(codeFiles);
    const codeHash = createHash("sha256").update(codeZip).digest("hex");

    // TODO: Handle npm dependencies (deps layer)
    // For v1, we bundle everything with esbuild into a single IIFE.
    // Future versions will support separate deps layers for better caching.

    // Process mount layers if configured
    const intersectedPolicy = intersectPolicies(this.options.policy, params.policy);
    const mountLayers: FSLayer[] = [];
    const mountZips = new Map<string, Uint8Array>();

    if (intersectedPolicy.filesystem.mounts && intersectedPolicy.filesystem.mounts.length > 0) {
      // Build mount layers
      const mountResults = await this.mountBuilder.buildMountLayers(
        intersectedPolicy.filesystem.mounts,
        this.options.cacheDir
      );

      // Extract layers and store zips
      for (const result of mountResults) {
        mountLayers.push(result.layer);
        // Read the zip file that was created
        const zipData = await readFile(result.zipPath);
        mountZips.set(result.layer.id, zipData);
      }
    }

    // Build capsule manifest (unsigned)
    const capsule: Omit<Capsule, "sig"> = {
      version: "1",
      language: "js",
      runtime: { id: "quickjs@2025-10" },
      entry: {
        path: "/entry.js",
        argv: params.args || [],
        env: params.env || {},
        cwd: params.cwd || "/",
      },
      fsLayers: [
        {
          id: "code",
          sha256: codeHash,
          path: "fs.code.zip",
        },
        ...mountLayers, // Include mount layers
      ],
      policy: intersectedPolicy,
    };

    // Compute hash BEFORE signing (enables deduplication)
    const capsuleHash = this.getCapsuleHash(capsule);

    // Check if capsule already exists (cache hit!)
    if (await this.capsuleExists(capsuleHash)) {
      return capsuleHash; // Skip signing and saving
    }

    // Cache miss: sign and save
    const sig = await this.signCapsule(capsule);
    const signedCapsule: Capsule = { ...capsule, sig };
    await this.saveCapsule(capsuleHash, signedCapsule, codeZip, mountZips);

    return capsuleHash;
  }

  private async signCapsule(capsule: Omit<Capsule, "sig">): Promise<string> {
    if (!this.privateKey) {
      throw new Error("CapsuleBuilder not initialized");
    }

    const jwt = await new SignJWT({ capsule })
      .setProtectedHeader({ alg: "EdDSA" })
      .setIssuedAt()
      .sign(this.privateKey);

    return jwt;
  }

  /**
   * Compute capsule hash from unsigned capsule (enables deduplication)
   * Hash is based on content only, not signature
   */
  private getCapsuleHash(capsule: Omit<Capsule, "sig">): string {
    const json = JSON.stringify(capsule);
    return createHash("sha256").update(json).digest("hex").slice(0, 16);
  }

  /**
   * Check if capsule already exists in cache
   */
  private async capsuleExists(hash: string): Promise<boolean> {
    const capsulePath = join(this.options.cacheDir, hash, "capsule.json");
    try {
      await access(capsulePath, constants.F_OK);
      return true; // File exists
    } catch {
      return false; // File doesn't exist
    }
  }

  /**
   * Generate build cache key from code and dependencies
   * Same code + deps → same key → cache hit
   */
  private getBuildCacheKey(params: RunJsParams): string {
    const key = JSON.stringify({
      code: params.code,
      npm: params.npm || {},
    });
    return createHash("sha256").update(key).digest("hex");
  }

  private async saveCapsule(
    hash: string,
    capsule: Capsule,
    codeZip: Uint8Array,
    mountZips?: Map<string, Uint8Array>
  ): Promise<void> {
    const dir = resolve(this.options.cacheDir, hash);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "capsule.json"),
      JSON.stringify(capsule, null, 2)
    );
    await writeFile(join(dir, "fs.code.zip"), codeZip);

    // Save mount zips if provided
    if (mountZips) {
      for (const [layerId, zipData] of mountZips) {
        await writeFile(join(dir, `fs.${layerId}.zip`), zipData);
      }
    }
  }

  /**
   * Get capsule directory for serving
   */
  getCapsuleDir(hash: string): string {
    return resolve(this.options.cacheDir, hash);
  }
}
