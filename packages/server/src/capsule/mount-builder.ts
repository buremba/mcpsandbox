/**
 * Mount layer builder - processes filesystem mounts into fsLayers
 */

import { mkdir, stat } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { createWriteStream, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import type { Logger } from "pino";
import type { Mount, FSLayer } from "@onemcp/shared";
import { GitCloner } from "../services/git-cloner.js";

export interface MountLayerResult {
  layer: FSLayer;
  zipPath: string; // Path to created zip file
}

export class MountLayerBuilder {
  private logger?: Logger;
  private gitCloner: GitCloner;

  constructor(logger?: Logger) {
    this.logger = logger;
    this.gitCloner = new GitCloner(logger);
  }

  /**
   * Build all mount layers from configuration
   */
  async buildMountLayers(
    mounts: Mount[],
    outputDir: string
  ): Promise<MountLayerResult[]> {
    const results: MountLayerResult[] = [];

    for (const mount of mounts) {
      if (!mount) continue;

      const layerId = `mount-${basename(mount.target).replace(/[^a-z0-9]/gi, "-")}`;

      this.logger?.info({ mount, layerId }, "Building mount layer");

      const result = await this.buildMountLayer(mount, layerId, outputDir);
      results.push(result);
    }

    return results;
  }

  /**
   * Build a single mount layer
   */
  private async buildMountLayer(
    mount: Mount,
    layerId: string,
    outputDir: string
  ): Promise<MountLayerResult> {
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Get source directory
    let sourcePath: string;
    let cleanup: (() => Promise<void>) | undefined;

    if (mount.type === "git") {
      // Clone git repository
      const cloneResult = await this.gitCloner.clone({
        url: mount.source,
        ref: mount.gitRef,
      });
      sourcePath = cloneResult.path;
      cleanup = cloneResult.cleanup;

      this.logger?.info(
        { commit: cloneResult.commit, path: sourcePath },
        "Git repository cloned for mount"
      );
    } else if (mount.type === "directory") {
      // Use local directory
      sourcePath = resolve(mount.source);

      // Validate directory exists
      try {
        const stats = await stat(sourcePath);
        if (!stats.isDirectory()) {
          throw new Error(`Mount source is not a directory: ${mount.source}`);
        }
      } catch (error) {
        throw new Error(
          `Mount source directory not found: ${mount.source}`
        );
      }
    } else {
      throw new Error(`Unknown mount type: ${(mount as any).type}`);
    }

    try {
      // Create zip file
      const zipPath = join(outputDir, `fs.${layerId}.zip`);
      await this.createZipFromDirectory(sourcePath, zipPath);

      // Calculate SHA-256 hash
      const sha256 = await this.calculateFileHash(zipPath);

      this.logger?.info({ zipPath, sha256, size: await this.getFileSize(zipPath) }, "Mount layer created");

      const layer: FSLayer = {
        id: layerId,
        sha256,
        path: `fs.${layerId}.zip`,
        target: mount.target,
      };

      return { layer, zipPath };
    } finally {
      // Clean up git clone temp directory
      if (cleanup) {
        await cleanup();
      }
    }
  }

  /**
   * Create a zip file from a directory
   */
  private async createZipFromDirectory(
    sourceDir: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 6 } });

      output.on("close", () => resolve());
      archive.on("error", (err: Error) => reject(err));

      archive.pipe(output);

      // Add directory contents to archive
      // Use glob pattern to exclude common unwanted files
      archive.glob("**/*", {
        cwd: sourceDir,
        ignore: [
          ".git/**",
          ".git",
          "node_modules/**",
          ".DS_Store",
          "*.log",
          ".env",
          ".env.*",
        ],
      });

      archive.finalize();
    });
  }

  /**
   * Calculate SHA-256 hash of a file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    await pipeline(stream, hash);

    return hash.digest("hex");
  }

  /**
   * Get file size in bytes
   */
  private async getFileSize(filePath: string): Promise<number> {
    const stats = await stat(filePath);
    return stats.size;
  }
}
