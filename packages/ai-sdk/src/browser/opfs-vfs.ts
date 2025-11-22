/**
 * OPFS (Origin Private File System) Virtual Filesystem for Browser
 *
 * Implements VirtualFilesystem interface using browser's OPFS API.
 * Provides sandboxed filesystem access with policy enforcement.
 */

import type { FilesystemPolicy } from "@onemcp/shared";

/**
 * Browser-compatible filesystem policy enforcer
 */
class BrowserFilesystemPolicyEnforcer {
	constructor(private policy: FilesystemPolicy) {}

	canRead(path: string): boolean {
		const normalized = this.normalizePath(path);
		if (this.isPathEscape(normalized)) return false;

		const allReadable = [...this.policy.readonly, ...this.policy.writable];
		return this.matchesPathList(normalized, allReadable);
	}

	canWrite(path: string): boolean {
		const normalized = this.normalizePath(path);
		if (this.isPathEscape(normalized)) return false;

		return this.matchesPathList(normalized, this.policy.writable);
	}

	private normalizePath(path: string): string {
		// Simple normalization for browser
		if (!path.startsWith("/")) path = "/" + path;
		return path.replace(/\/+/g, "/");
	}

	private isPathEscape(path: string): boolean {
		return path.includes("..") || !path.startsWith("/");
	}

	private matchesPathList(path: string, list: string[]): boolean {
		for (const allowed of list) {
			const normalizedAllowed = this.normalizePath(allowed);
			if (
				path === normalizedAllowed ||
				path.startsWith(normalizedAllowed + "/")
			) {
				return true;
			}
		}
		return false;
	}
}

export class OPFSVirtualFilesystem {
	private root: FileSystemDirectoryHandle | null = null;
	private policy: BrowserFilesystemPolicyEnforcer;

	constructor(policy: FilesystemPolicy) {
		this.policy = new BrowserFilesystemPolicyEnforcer(policy);
	}

	/**
	 * Initialize OPFS root directory
	 */
	async initialize(): Promise<void> {
		if (typeof navigator === "undefined" || !navigator.storage) {
			throw new Error("OPFS not supported in this environment");
		}

		this.root = await navigator.storage.getDirectory();
	}

	/**
	 * Read file contents
	 */
	async readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer> {
		// Policy check
		if (!this.policy.canRead(path)) {
			throw new Error(`Read access denied: ${path}`);
		}

		const fileHandle = await this.getFileHandle(path);
		const file = await fileHandle.getFile();
		const contents = await file.text();

		// Return as string or Buffer based on encoding
		if (encoding === undefined) {
			// Return as Buffer (Uint8Array in browser)
			const encoder = new TextEncoder();
			return encoder.encode(contents) as unknown as Buffer;
		}

		return contents;
	}

	/**
	 * Write file contents
	 */
	async writeFile(path: string, data: string | Buffer): Promise<void> {
		// Policy check
		if (!this.policy.canWrite(path)) {
			throw new Error(`Write access denied: ${path}`);
		}

		const fileHandle = await this.getFileHandle(path, { create: true });
		const writable = await fileHandle.createWritable();

		try {
			if (typeof data === "string") {
				await writable.write(data);
			} else {
				await writable.write(new Uint8Array(data));
			}
		} finally {
			await writable.close();
		}
	}

	/**
	 * List directory contents
	 */
	async readdir(path: string): Promise<string[]> {
		// Policy check
		if (!this.policy.canRead(path)) {
			throw new Error(`Read access denied: ${path}`);
		}

		const dirHandle = await this.getDirectoryHandle(path);
		const entries: string[] = [];

		for await (const [name] of (dirHandle as any).entries()) {
			entries.push(name);
		}

		return entries;
	}

	/**
	 * Create directory
	 */
	async mkdir(path: string, _options?: { recursive?: boolean }): Promise<void> {
		// Policy check
		if (!this.policy.canWrite(path)) {
			throw new Error(`Write access denied: ${path}`);
		}

		const parts = this.parsePath(path);
		let currentDir = this.root!;

		for (const part of parts) {
			currentDir = await currentDir.getDirectoryHandle(part, {
				create: true,
			});
		}
	}

	/**
	 * Get file stats
	 */
	async stat(
		path: string,
	): Promise<{ size: number; isFile: boolean; isDirectory: boolean; mtimeMs: number }> {
		// Policy check
		if (!this.policy.canRead(path)) {
			throw new Error(`Read access denied: ${path}`);
		}

		try {
			const fileHandle = await this.getFileHandle(path);
			const file = await fileHandle.getFile();
			return {
				size: file.size,
				isFile: true,
				isDirectory: false,
				mtimeMs: file.lastModified,
			};
		} catch {
			// Try as directory
			await this.getDirectoryHandle(path);
			return {
				size: 0,
				isFile: false,
				isDirectory: true,
				mtimeMs: Date.now(),
			};
		}
	}

	/**
	 * Check if path exists
	 */
	async exists(path: string): Promise<boolean> {
		// Policy check
		if (!this.policy.canRead(path)) {
			throw new Error(`Read access denied: ${path}`);
		}

		try {
			await this.getFileHandle(path);
			return true;
		} catch {
			try {
				await this.getDirectoryHandle(path);
				return true;
			} catch {
				return false;
			}
		}
	}

	/**
	 * Delete file
	 */
	async unlink(path: string): Promise<void> {
		// Policy check
		if (!this.policy.canWrite(path)) {
			throw new Error(`Write access denied: ${path}`);
		}

		const parts = this.parsePath(path);
		const fileName = parts.pop()!;
		const dirHandle = await this.getDirectoryHandle(parts.join("/") || "/");

		await dirHandle.removeEntry(fileName);
	}

	/**
	 * Remove directory
	 */
	async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
		// Policy check
		if (!this.policy.canWrite(path)) {
			throw new Error(`Write access denied: ${path}`);
		}

		const parts = this.parsePath(path);
		const dirName = parts.pop()!;
		const parentHandle = await this.getDirectoryHandle(parts.join("/") || "/");

		await parentHandle.removeEntry(dirName, { recursive: options?.recursive });
	}

	/**
	 * Get file handle, creating parent directories if needed
	 */
	private async getFileHandle(
		path: string,
		options?: { create?: boolean },
	): Promise<FileSystemFileHandle> {
		const parts = this.parsePath(path);
		const fileName = parts.pop()!;

		let currentDir = this.root!;

		// Navigate to parent directory, creating if needed
		for (const part of parts) {
			currentDir = await currentDir.getDirectoryHandle(part, {
				create: options?.create,
			});
		}

		return await currentDir.getFileHandle(fileName, options);
	}

	/**
	 * Get directory handle
	 */
	private async getDirectoryHandle(path: string): Promise<FileSystemDirectoryHandle> {
		if (path === "/" || path === "") {
			return this.root!;
		}

		const parts = this.parsePath(path);
		let currentDir = this.root!;

		for (const part of parts) {
			currentDir = await currentDir.getDirectoryHandle(part);
		}

		return currentDir;
	}

	/**
	 * Parse path into parts, handling path traversal attempts
	 */
	private parsePath(path: string): string[] {
		// Remove leading slash and split
		const cleanPath = path.startsWith("/") ? path.slice(1) : path;

		// Split and filter out empty parts and '..'
		const parts = cleanPath.split("/").filter((part) => {
			if (!part || part === ".") return false;
			if (part === "..") {
				throw new Error("Path traversal not allowed: ..");
			}
			return true;
		});

		return parts;
	}
}
