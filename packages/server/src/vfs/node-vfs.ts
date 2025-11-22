/**
 * Node.js Virtual Filesystem Implementation
 *
 * Wraps Node.js fs/promises with policy enforcement and VFS path mapping.
 * Maps VFS paths (/host/, /tmp/, /out/) to real filesystem locations.
 */

import { promises as fs } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import type {
	VirtualFilesystem,
	ReadFileOptions,
	WriteFileOptions,
	DirEntry,
	Stats,
} from '@onemcp/shared';
import { FilesystemPolicyEnforcer } from '../policy/filesystem.js';

export interface NodeVFSOptions {
	/** Base directory for this VFS instance (all paths resolve relative to this) */
	baseDir: string;
	/** Policy enforcer for read/write access control */
	policy: FilesystemPolicyEnforcer;
}

/**
 * Node.js implementation of VirtualFilesystem
 *
 * Security features:
 * - All paths are resolved relative to baseDir (cannot escape)
 * - Policy enforcement on every operation
 * - Path traversal protection
 * - Symlink escape detection via realpath checks
 */
export class NodeVirtualFilesystem implements VirtualFilesystem {
	private readonly baseDir: string;
	private readonly policy: FilesystemPolicyEnforcer;

	constructor(options: NodeVFSOptions) {
		this.baseDir = resolve(options.baseDir);
		this.policy = options.policy;
	}

	async readFile(
		path: string,
		options: ReadFileOptions = {}
	): Promise<string | Uint8Array> {
		// Policy check
		const check = this.policy.canRead(path);
		if (!check.allowed) {
			throw new Error(`Policy denied read access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);

		// Get file stats for size check
		const stats = await fs.stat(realPath);

		// Enforce size limit if specified
		if (options.maxBytes && stats.size > options.maxBytes) {
			throw new Error(
				`File size ${stats.size} exceeds limit ${options.maxBytes}`
			);
		}

		// Read file
		if (options.encoding === 'binary') {
			return await fs.readFile(realPath);
		}
		return await fs.readFile(realPath, 'utf-8');
	}

	async writeFile(
		path: string,
		content: string | Uint8Array,
		options: WriteFileOptions = {}
	): Promise<void> {
		// Policy check
		const check = this.policy.canWrite(path);
		if (!check.allowed) {
			throw new Error(`Policy denied write access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);
		const mode = options.mode || 'overwrite';

		// Ensure parent directory exists
		const parentDir = dirname(realPath);
		await fs.mkdir(parentDir, { recursive: true });

		// Handle different write modes
		if (mode === 'create') {
			// Check if file already exists
			try {
				await fs.access(realPath);
				throw new Error(`File already exists: ${path}`);
			} catch (err: any) {
				if (err.code !== 'ENOENT') throw err;
				// File doesn't exist, proceed with creation
			}
		}

		if (mode === 'append') {
			await fs.appendFile(realPath, content);
		} else {
			// create or overwrite
			await fs.writeFile(realPath, content);
		}
	}

	async appendFile(path: string, content: string | Uint8Array): Promise<void> {
		return this.writeFile(path, content, { mode: 'append' });
	}

	async readdir(path: string): Promise<DirEntry[]> {
		// Policy check
		const check = this.policy.canRead(path);
		if (!check.allowed) {
			throw new Error(`Policy denied read access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);

		// Read directory with file types
		const entries = await fs.readdir(realPath, { withFileTypes: true });

		return entries.map((entry) => ({
			name: entry.name,
			type: entry.isFile()
				? 'file'
				: entry.isDirectory()
					? 'directory'
					: 'symlink',
		}));
	}

	async mkdir(
		path: string,
		options?: { recursive?: boolean }
	): Promise<void> {
		// Policy check
		const check = this.policy.canWrite(path);
		if (!check.allowed) {
			throw new Error(`Policy denied write access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);
		await fs.mkdir(realPath, { recursive: options?.recursive });
	}

	async stat(path: string): Promise<Stats> {
		// Policy check (stat requires read access)
		const check = this.policy.canRead(path);
		if (!check.allowed) {
			throw new Error(`Policy denied read access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);
		const stats = await fs.stat(realPath);

		return {
			type: stats.isFile()
				? 'file'
				: stats.isDirectory()
					? 'directory'
					: 'symlink',
			size: stats.size,
			mtime: stats.mtime,
			atime: stats.atime,
			ctime: stats.ctime,
			mode: stats.mode,
		};
	}

	async exists(path: string): Promise<boolean> {
		try {
			const realPath = this.resolvePath(path);
			await fs.access(realPath);
			return true;
		} catch {
			return false;
		}
	}

	async unlink(path: string): Promise<void> {
		// Policy check
		const check = this.policy.canWrite(path);
		if (!check.allowed) {
			throw new Error(`Policy denied write access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);
		await fs.unlink(realPath);
	}

	async rmdir(
		path: string,
		options?: { recursive?: boolean }
	): Promise<void> {
		// Policy check
		const check = this.policy.canWrite(path);
		if (!check.allowed) {
			throw new Error(`Policy denied write access: ${check.reason}`);
		}

		const realPath = this.resolvePath(path);

		if (options?.recursive) {
			// Use rm with recursive flag (Node.js 14.14+)
			await fs.rm(realPath, { recursive: true, force: false });
		} else {
			await fs.rmdir(realPath);
		}
	}

	async realpath(path: string): Promise<string> {
		const realPath = this.resolvePath(path);
		const resolved = await fs.realpath(realPath);

		// Convert back to VFS path
		const rel = relative(this.baseDir, resolved);
		return '/' + rel.replace(/\\/g, '/');
	}

	/**
	 * Resolve VFS path to real filesystem path
	 *
	 * Security:
	 * - Normalizes path to prevent traversal attacks
	 * - Ensures path stays within baseDir
	 * - Throws if attempting to escape sandbox
	 */
	private resolvePath(vfsPath: string): string {
		// Normalize VFS path (remove .., ., extra slashes)
		const normalized = resolve('/', vfsPath);

		// Join with baseDir
		const realPath = join(this.baseDir, normalized);

		// Verify path is within baseDir (prevent escape)
		const rel = relative(this.baseDir, realPath);
		if (rel.startsWith('..') || resolve(this.baseDir, rel) !== realPath) {
			throw new Error(`Path escape attempt detected: ${vfsPath}`);
		}

		return realPath;
	}
}
