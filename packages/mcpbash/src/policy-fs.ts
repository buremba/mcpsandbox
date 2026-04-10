import type { CpOptions, FsStat, IFileSystem, MkdirOptions, RmOptions } from "just-bash";
import { isPathAllowed, normalizeRelativePath } from "./patterns";

type ReadDirWithTypesResult = Awaited<
  ReturnType<NonNullable<IFileSystem["readdirWithFileTypes"]>>
>;

function childPath(parent: string, child: string): string {
  if (parent === "/") {
    return `/${child}`;
  }
  return `${parent}/${child}`;
}

export class PolicyFileSystem implements IFileSystem {
  constructor(
    private readonly inner: IFileSystem,
    private readonly allowPatterns: string[],
    private readonly denyPatterns: string[]
  ) {}

  private ensureAllowed(path: string): void {
    const relativePath = normalizeRelativePath(path);
    if (!isPathAllowed(relativePath, this.allowPatterns, this.denyPatterns)) {
      throw new Error(`Path is blocked by sandbox policy: ${path}`);
    }
  }

  private isAllowed(path: string): boolean {
    return isPathAllowed(
      normalizeRelativePath(path),
      this.allowPatterns,
      this.denyPatterns
    );
  }

  async readFile(path: string, options?: unknown) {
    this.ensureAllowed(path);
    return this.inner.readFile(path, options as never);
  }

  async readFileBuffer(path: string) {
    this.ensureAllowed(path);
    return this.inner.readFileBuffer(path);
  }

  async writeFile(path: string, content: string | Uint8Array, options?: unknown) {
    this.ensureAllowed(path);
    return this.inner.writeFile(path, content, options as never);
  }

  async appendFile(
    path: string,
    content: string | Uint8Array,
    options?: unknown
  ) {
    this.ensureAllowed(path);
    return this.inner.appendFile(path, content, options as never);
  }

  async exists(path: string) {
    if (!this.isAllowed(path)) {
      return false;
    }
    return this.inner.exists(path);
  }

  async stat(path: string): Promise<FsStat> {
    this.ensureAllowed(path);
    return this.inner.stat(path);
  }

  async lstat(path: string): Promise<FsStat> {
    this.ensureAllowed(path);
    return this.inner.lstat(path);
  }

  async mkdir(path: string, options?: MkdirOptions) {
    this.ensureAllowed(path);
    return this.inner.mkdir(path, options);
  }

  async readdir(path: string): Promise<string[]> {
    this.ensureAllowed(path);
    const entries = await this.inner.readdir(path);
    return entries.filter((entry) => this.isAllowed(childPath(path, entry)));
  }

  async readdirWithFileTypes(path: string): Promise<ReadDirWithTypesResult> {
    this.ensureAllowed(path);
    if (!this.inner.readdirWithFileTypes) {
      const entries = await this.readdir(path);
      return entries.map((entry) => ({
        name: entry,
        isFile: false,
        isDirectory: false,
        isSymbolicLink: false,
      })) as ReadDirWithTypesResult;
    }

    const entries = await this.inner.readdirWithFileTypes(path);
    return entries.filter((entry) => this.isAllowed(childPath(path, entry.name)));
  }

  async rm(path: string, options?: RmOptions) {
    this.ensureAllowed(path);
    return this.inner.rm(path, options);
  }

  async cp(src: string, dest: string, options?: CpOptions) {
    this.ensureAllowed(src);
    this.ensureAllowed(dest);
    return this.inner.cp(src, dest, options);
  }

  async mv(src: string, dest: string) {
    this.ensureAllowed(src);
    this.ensureAllowed(dest);
    return this.inner.mv(src, dest);
  }

  resolvePath(base: string, relativePath: string): string {
    return this.inner.resolvePath(base, relativePath);
  }

  getAllPaths(): string[] {
    return this.inner
      .getAllPaths()
      .filter((entry) => this.isAllowed(entry));
  }

  async chmod(path: string, mode: number) {
    this.ensureAllowed(path);
    return this.inner.chmod(path, mode);
  }

  async symlink(target: string, linkPath: string) {
    this.ensureAllowed(target);
    this.ensureAllowed(linkPath);
    return this.inner.symlink(target, linkPath);
  }

  async link(existingPath: string, newPath: string) {
    this.ensureAllowed(existingPath);
    this.ensureAllowed(newPath);
    return this.inner.link(existingPath, newPath);
  }

  async readlink(path: string) {
    this.ensureAllowed(path);
    return this.inner.readlink(path);
  }

  async realpath(path: string) {
    this.ensureAllowed(path);
    return this.inner.realpath(path);
  }

  async utimes(path: string, atime: Date, mtime: Date) {
    this.ensureAllowed(path);
    return this.inner.utimes(path, atime, mtime);
  }
}
