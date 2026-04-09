/**
 * Composite VFS Backend
 *
 * Routes operations to different backends based on mount points.
 * Example:
 *   /workspace -> LocalVFSBackend
 *   /storage   -> R2VFSBackend
 *   /tmp       -> MemoryVFSBackend
 */

import type {
  VFSBackend,
  VFSCapabilities,
  FileInfo,
  ListOptions,
  ListResult,
  WriteOptions,
} from "./interface.js";

/**
 * Mount point entry
 */
interface MountPoint {
  /** Mount target path (e.g., "/workspace") */
  target: string;
  /** VFS backend for this mount */
  backend: VFSBackend;
  /** Whether mounted as read-only */
  readonly: boolean;
}

/**
 * Composite VFS Backend
 */
export class CompositeVFSBackend implements VFSBackend {
  readonly name = "composite";
  readonly capabilities: VFSCapabilities = {
    read: true,
    write: true,
    delete: true,
    directories: true,
    symlinks: false,
    watch: false,
    maxFileSize: 0,
  };

  private mounts: MountPoint[] = [];

  /**
   * Add a mount point
   * @param target Mount target path (must start with /)
   * @param backend VFS backend to mount
   * @param readonly Mount as read-only
   */
  mount(target: string, backend: VFSBackend, readonly: boolean = false): void {
    // Normalize target path
    if (!target.startsWith("/")) {
      target = "/" + target;
    }
    if (target !== "/" && target.endsWith("/")) {
      target = target.slice(0, -1);
    }

    // Check for overlapping mounts
    for (const mount of this.mounts) {
      if (mount.target === target) {
        throw new Error(`Mount point already exists: ${target}`);
      }
    }

    this.mounts.push({ target, backend, readonly });

    // Sort mounts by path length (longest first) for correct routing
    this.mounts.sort((a, b) => b.target.length - a.target.length);
  }

  /**
   * Remove a mount point
   */
  unmount(target: string): void {
    const index = this.mounts.findIndex((m) => m.target === target);
    if (index === -1) {
      throw new Error(`Mount point not found: ${target}`);
    }
    this.mounts.splice(index, 1);
  }

  /**
   * Get all mount points
   */
  getMounts(): Array<{ target: string; backend: string; readonly: boolean }> {
    return this.mounts.map((m) => ({
      target: m.target,
      backend: m.backend.name,
      readonly: m.readonly,
    }));
  }

  /**
   * Resolve a path to its mount point and relative path
   */
  private resolve(path: string): { mount: MountPoint; relativePath: string } {
    // Normalize path
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    for (const mount of this.mounts) {
      if (path === mount.target || path.startsWith(mount.target + "/")) {
        const relativePath = path === mount.target ? "/" : path.slice(mount.target.length);
        return { mount, relativePath };
      }
    }

    throw new Error(`No mount point found for path: ${path}`);
  }

  async read(path: string): Promise<Uint8Array> {
    const { mount, relativePath } = this.resolve(path);
    return mount.backend.read(relativePath);
  }

  async readText(path: string): Promise<string> {
    const { mount, relativePath } = this.resolve(path);
    return mount.backend.readText(relativePath);
  }

  async write(path: string, data: Uint8Array, options?: WriteOptions): Promise<void> {
    const { mount, relativePath } = this.resolve(path);

    if (mount.readonly) {
      throw new Error(`Mount point is read-only: ${mount.target}`);
    }

    return mount.backend.write(relativePath, data, options);
  }

  async writeText(path: string, text: string, options?: WriteOptions): Promise<void> {
    const { mount, relativePath } = this.resolve(path);

    if (mount.readonly) {
      throw new Error(`Mount point is read-only: ${mount.target}`);
    }

    return mount.backend.writeText(relativePath, text, options);
  }

  async delete(path: string): Promise<void> {
    const { mount, relativePath } = this.resolve(path);

    if (mount.readonly) {
      throw new Error(`Mount point is read-only: ${mount.target}`);
    }

    return mount.backend.delete(relativePath);
  }

  async stat(path: string): Promise<FileInfo> {
    const { mount, relativePath } = this.resolve(path);
    const info = await mount.backend.stat(relativePath);

    // Adjust path to include mount point
    return {
      ...info,
      path: path,
    };
  }

  async exists(path: string): Promise<boolean> {
    try {
      const { mount, relativePath } = this.resolve(path);
      return mount.backend.exists(relativePath);
    } catch {
      return false;
    }
  }

  async list(path: string, options?: ListOptions): Promise<string[]> {
    const result = await this.listPaginated(path, options);
    return result.entries;
  }

  async listPaginated(path: string, options?: ListOptions): Promise<ListResult> {
    // Handle root path - list mount points
    if (path === "/" || path === "") {
      const entries = this.mounts.map((m) => m.target.slice(1)); // Remove leading /
      return {
        entries,
        hasMore: false,
      };
    }

    const { mount, relativePath } = this.resolve(path);
    return mount.backend.listPaginated(relativePath, options);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const { mount, relativePath } = this.resolve(path);

    if (mount.readonly) {
      throw new Error(`Mount point is read-only: ${mount.target}`);
    }

    return mount.backend.mkdir(relativePath, options);
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const { mount, relativePath } = this.resolve(path);

    if (mount.readonly) {
      throw new Error(`Mount point is read-only: ${mount.target}`);
    }

    return mount.backend.rmdir(relativePath, options);
  }

  async copy(src: string, dest: string, options?: { recursive?: boolean }): Promise<void> {
    const srcResolved = this.resolve(src);
    const destResolved = this.resolve(dest);

    if (destResolved.mount.readonly) {
      throw new Error(`Destination mount point is read-only: ${destResolved.mount.target}`);
    }

    // If same mount, use native copy
    if (srcResolved.mount === destResolved.mount) {
      return srcResolved.mount.backend.copy(
        srcResolved.relativePath,
        destResolved.relativePath,
        options
      );
    }

    // Cross-mount copy - read from source, write to destination
    const info = await srcResolved.mount.backend.stat(srcResolved.relativePath);

    if (info.isFile) {
      const data = await srcResolved.mount.backend.read(srcResolved.relativePath);
      await destResolved.mount.backend.write(destResolved.relativePath, data, {
        createParents: true,
      });
    } else {
      if (!options?.recursive) {
        throw new Error("Cannot copy directory without recursive option");
      }

      // Recursive copy
      await destResolved.mount.backend.mkdir(destResolved.relativePath, { recursive: true });

      const entries = await srcResolved.mount.backend.list(srcResolved.relativePath, {
        recursive: true,
      });

      for (const entry of entries) {
        const srcPath = `${src}/${entry}`;
        const destPath = `${dest}/${entry}`;
        const entryInfo = await srcResolved.mount.backend.stat(
          `${srcResolved.relativePath}/${entry}`
        );

        if (entryInfo.isFile) {
          const data = await this.read(srcPath);
          await this.write(destPath, data, { createParents: true });
        } else {
          await this.mkdir(destPath, { recursive: true });
        }
      }
    }
  }

  async move(src: string, dest: string): Promise<void> {
    const srcResolved = this.resolve(src);
    const destResolved = this.resolve(dest);

    if (srcResolved.mount.readonly) {
      throw new Error(`Source mount point is read-only: ${srcResolved.mount.target}`);
    }

    if (destResolved.mount.readonly) {
      throw new Error(`Destination mount point is read-only: ${destResolved.mount.target}`);
    }

    // If same mount, use native move
    if (srcResolved.mount === destResolved.mount) {
      return srcResolved.mount.backend.move(
        srcResolved.relativePath,
        destResolved.relativePath
      );
    }

    // Cross-mount move - copy then delete
    await this.copy(src, dest, { recursive: true });

    const info = await srcResolved.mount.backend.stat(srcResolved.relativePath);
    if (info.isFile) {
      await srcResolved.mount.backend.delete(srcResolved.relativePath);
    } else {
      await srcResolved.mount.backend.rmdir(srcResolved.relativePath, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    // Initialize all mounted backends
    for (const mount of this.mounts) {
      if (mount.backend.initialize) {
        await mount.backend.initialize();
      }
    }
  }

  async close(): Promise<void> {
    // Close all mounted backends
    for (const mount of this.mounts) {
      if (mount.backend.close) {
        await mount.backend.close();
      }
    }
  }
}

/**
 * Create a composite VFS backend
 */
export function createCompositeVFS(): CompositeVFSBackend {
  return new CompositeVFSBackend();
}

/**
 * Create a composite VFS backend with the given mounts
 */
export async function createCompositeVFSWithMounts(
  mounts: Array<{ target: string; backend: VFSBackend; readonly?: boolean }>
): Promise<CompositeVFSBackend> {
  const composite = new CompositeVFSBackend();

  for (const { target, backend, readonly } of mounts) {
    composite.mount(target, backend, readonly);
  }

  await composite.initialize();
  return composite;
}
