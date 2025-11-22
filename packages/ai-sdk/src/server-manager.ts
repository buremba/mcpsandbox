/**
 * Server manager for embedded relay-mcp
 */

import { startServer, type ServerConfig } from "1mcp";
import type { RelayConfig } from "@onemcp/shared";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface EmbeddedServerOptions {
	port?: number;
	config: Partial<RelayConfig>;
}

export interface EmbeddedServer {
	port: number;
	workDir: string;
	baseUrl: string;
	stop: () => Promise<void>;
}

/**
 * Start an embedded relay-mcp server
 */
export async function startEmbeddedRelay(
	options: EmbeddedServerOptions,
): Promise<EmbeddedServer> {
	const port = options.port || await findAvailablePort(7888);
	const workDir = join(tmpdir(), `1mcp-${Date.now()}`);
	const cacheDir = join(workDir, ".relay/capsules");
	const keyPath = join(workDir, ".relay/keys");

	// Create directories
	await mkdir(cacheDir, { recursive: true });
	await mkdir(keyPath, { recursive: true });

	// Merge default config with provided config
	const defaultConfig: RelayConfig = {
		language: "js",
		npm: { dependencies: {}, lockfile: "" },
		policy: {
			network: {
				allowedDomains: ["*"],
				deniedDomains: [],
				denyIpLiterals: false,
				blockPrivateRanges: false,
				maxBodyBytes: 5242880,
				maxRedirects: 5,
			},
			filesystem: {
				readonly: ["/"],
				writable: ["/tmp", "/out"],
			},
			limits: {
				timeoutMs: 60000,
				memMb: 256,
				stdoutBytes: 1048576,
			},
		},
		mcps: [],
		sessionTtlMs: 300000,
		signingKeyPath: keyPath,
		cacheDir,
	};

	const config: RelayConfig = {
		...defaultConfig,
		...options.config,
		policy: {
			...defaultConfig.policy,
			...options.config.policy,
			network: {
				...defaultConfig.policy.network,
				...options.config.policy?.network,
			},
			filesystem: {
				...defaultConfig.policy.filesystem,
				...options.config.policy?.filesystem,
			},
			limits: {
				...defaultConfig.policy.limits,
				...options.config.policy?.limits,
			},
		},
	};

	const serverConfig: ServerConfig = {
		config,
		port,
		bindAddress: "127.0.0.1",
		headless: true, // No UI for embedded mode
		keyPath,
		cacheDir,
	};

	const server = await startServer(serverConfig);

	return {
		port,
		workDir,
		baseUrl: `http://127.0.0.1:${port}`,
		stop: async () => {
			return new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		},
	};
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number): Promise<number> {
	const { createServer } = await import("node:net");

	return new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.listen(startPort, () => {
			const { port } = server.address() as { port: number };
			server.close(() => resolve(port));
		});
		server.on("error", async (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				// Try next port
				resolve(await findAvailablePort(startPort + 1));
			} else {
				reject(err);
			}
		});
	});
}
