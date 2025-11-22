/**
 * Web Worker for WASM execution in browser
 *
 * This worker receives capsules from the main thread and executes them
 * in QuickJS or Pyodide WASM runtime.
 */

import type { Capsule } from "@onemcp/shared";
import { OPFSVirtualFilesystem } from "./opfs-vfs.js";
import { BrowserLayerExtractor } from "./layer-extractor.js";
import { RUNTIME_CDNS, setupConsole, injectVFSFunctions, dumpResult } from "@onemcp/shared";

interface WorkerMessage {
	type: "execute";
	capsule: {
		runId: string;
		manifest: Capsule;
		urls: {
			capsule: string;
			fsLayers: string[];
		};
	};
}

interface ResultMessage {
	type: "result";
	data: {
		runId: string;
		type: "stdout" | "stderr" | "exit" | "error";
		chunk?: string;
		exitCode?: number;
		error?: string;
	};
}

/**
 * Execute a capsule in WASM runtime
 */
async function executeCapsule(message: WorkerMessage["capsule"]): Promise<void> {
	const { runId, manifest } = message;

	try {
		// TODO: Implement actual WASM execution
		// This is a placeholder that demonstrates the structure

		postMessage({
			type: "result",
			data: {
				runId,
				type: "stdout",
				chunk: "Worker: Placeholder execution started\n",
			},
		} satisfies ResultMessage);

		// Load runtime based on manifest.language
		if (manifest.language === "js") {
			await executeJavaScript(runId, manifest, message.urls);
		} else if (manifest.language === "py") {
			await executePython(runId, manifest, message.urls);
		}

		// Success exit
		postMessage({
			type: "result",
			data: {
				runId,
				type: "exit",
				exitCode: 0,
			},
		} satisfies ResultMessage);
	} catch (error) {
		// Error exit
		postMessage({
			type: "result",
			data: {
				runId,
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			},
		} satisfies ResultMessage);

		postMessage({
			type: "result",
			data: {
				runId,
				type: "exit",
				exitCode: 1,
			},
		} satisfies ResultMessage);
	}
}

// Global VFS instance (persists across executions for session)
let vfs: OPFSVirtualFilesystem | null = null;

// Global QuickJS instance (loaded once)
let QuickJS: any = null;

/**
 * Load QuickJS WASM from CDN
 */
async function loadQuickJS(): Promise<any> {
	if (QuickJS) return QuickJS;

	try {
		// Try primary CDN first
		const module = await import(
			/* webpackIgnore: true */
			`${RUNTIME_CDNS.QUICKJS.PRIMARY}index.mjs`
		);
		QuickJS = await module.getQuickJS();
		return QuickJS;
	} catch (error) {
		console.warn("Primary CDN failed, trying fallback:", error);

		// Try fallback CDN
		try {
			const module = await import(
				/* webpackIgnore: true */
				`${RUNTIME_CDNS.QUICKJS.FALLBACK}index.mjs`
			);
			QuickJS = await module.getQuickJS();
			return QuickJS;
		} catch (fallbackError) {
			throw new Error(`Failed to load QuickJS from both CDNs: ${fallbackError}`);
		}
	}
}

/**
 * Execute JavaScript capsule using QuickJS WASM
 */
async function executeJavaScript(
	runId: string,
	manifest: Capsule,
	urls: { capsule: string; fsLayers: string[] },
): Promise<void> {
	try {
		// Initialize OPFS VFS if not already done
		if (!vfs && manifest.policy?.filesystem) {
			vfs = new OPFSVirtualFilesystem(manifest.policy.filesystem);
			await vfs.initialize();

			postMessage({
				type: "result",
				data: {
					runId,
					type: "stdout",
					chunk: "[OPFS] Virtual filesystem initialized\n",
				},
			} satisfies ResultMessage);
		}

		// Extract fsLayers to OPFS if VFS is available
		if (vfs && manifest.fsLayers && manifest.fsLayers.length > 0) {
			postMessage({
				type: "result",
				data: {
					runId,
					type: "stdout",
					chunk: `[Worker] Extracting ${manifest.fsLayers.length} filesystem layers...\n`,
				},
			} satisfies ResultMessage);

			const extractor = new BrowserLayerExtractor(vfs);

			// Get base URL from capsule URL (remove the filename)
			const baseUrl = urls.capsule.substring(0, urls.capsule.lastIndexOf("/"));

			const results = await extractor.extractLayers(manifest.fsLayers, baseUrl);

			for (const result of results) {
				postMessage({
					type: "result",
					data: {
						runId,
						type: "stdout",
						chunk: `[OPFS] Extracted layer '${result.layerId}': ${result.filesExtracted} files, ${Math.round(result.bytesExtracted / 1024)} KB\n`,
					},
				} satisfies ResultMessage);
			}
		}

		// Download capsule code
		postMessage({
			type: "result",
			data: {
				runId,
				type: "stdout",
				chunk: "[Worker] Downloading capsule...\n",
			},
		} satisfies ResultMessage);

		const capsuleResponse = await fetch(urls.capsule);
		const code = await capsuleResponse.text();

		// Setup guarded fetch for network policy
		if (manifest.policy?.network) {
			setupGuardedFetch(manifest.policy.network);
		}

		// Load QuickJS WASM
		postMessage({
			type: "result",
			data: {
				runId,
				type: "stdout",
				chunk: "[Worker] Loading QuickJS WASM...\n",
			},
		} satisfies ResultMessage);

		const quickjs = await loadQuickJS();
		const vm = quickjs.newContext();

		try {
			postMessage({
				type: "result",
				data: {
					runId,
					type: "stdout",
					chunk: "[Worker] Executing code in QuickJS...\n",
				},
			} satisfies ResultMessage);

			// Setup console using shared utility
			setupConsole(vm as any, {
				onStdout: (chunk: string) => {
					postMessage({
						type: "result",
						data: {
							runId,
							type: "stdout",
							chunk,
						},
					} satisfies ResultMessage);
				},
				onStderr: (chunk: string) => {
					postMessage({
						type: "result",
						data: {
							runId,
							type: "stderr",
							chunk,
						},
					} satisfies ResultMessage);
				},
			});

			// Inject VFS functions if available using shared utility
			if (vfs) {
				injectVFSFunctions(vm as any, vfs as any, {
					includeStat: false, // Browser VFS doesn't support stat yet
					onError: (error: string) => {
						postMessage({
							type: "result",
							data: {
								runId,
								type: "stderr",
								chunk: error + "\n",
							},
						} satisfies ResultMessage);
					},
				});
			}

			// Execute the code
			const result = vm.evalCode(code);

			if (result.error) {
				const error = vm.dump(result.error);
				result.error.dispose();

				postMessage({
					type: "result",
					data: {
						runId,
						type: "stderr",
						chunk: `Error: ${error}\n`,
					},
				} satisfies ResultMessage);
			} else {
				// Capture last expression result using shared utility
				const value = result.value ? dumpResult(vm as any, result.value) : undefined;
				result.value.dispose();

				if (value !== undefined) {
					postMessage({
						type: "result",
						data: {
							runId,
							type: "stdout",
							chunk: `Result: ${value}\n`,
						},
					} satisfies ResultMessage);
				}
			}
		} finally {
			vm.dispose();
		}
	} catch (error) {
		postMessage({
			type: "result",
			data: {
				runId,
				type: "stderr",
				chunk: `Error: ${error instanceof Error ? error.message : String(error)}\n`,
			},
		} satisfies ResultMessage);
		throw error;
	}
}

/**
 * Setup guarded fetch with network policy enforcement
 */
function setupGuardedFetch(networkPolicy: any) {
	const originalFetch = globalThis.fetch;

	(globalThis as any).fetch = async (url: string | URL, options?: RequestInit) => {
		const urlString = url.toString();

		// Policy checks
		const allowedDomains = networkPolicy.allowedDomains || [];
		const deniedDomains = networkPolicy.deniedDomains || [];
		const maxBodyBytes = networkPolicy.maxBodyBytes || 5 * 1024 * 1024;

		// Parse URL
		const urlObj = new URL(urlString);

		// Check denied domains
		for (const denied of deniedDomains) {
			if (urlObj.hostname.endsWith(denied.replace("*.", ""))) {
				throw new Error(`Network policy violation: Domain ${urlObj.hostname} is denied`);
			}
		}

		// Check allowed domains (if specified)
		if (allowedDomains.length > 0) {
			let allowed = false;
			for (const allowedDomain of allowedDomains) {
				if (allowedDomain.startsWith("*.")) {
					// Wildcard domain
					const suffix = allowedDomain.slice(2);
					if (urlObj.hostname.endsWith(suffix)) {
						allowed = true;
						break;
					}
				} else if (urlObj.hostname === allowedDomain) {
					allowed = true;
					break;
				}
			}

			if (!allowed) {
				throw new Error(`Network policy violation: Domain ${urlObj.hostname} not in allowed list`);
			}
		}

		// Check IP literals
		if (networkPolicy.denyIpLiterals) {
			const ipPattern = /^\d+\.\d+\.\d+\.\d+$/;
			if (ipPattern.test(urlObj.hostname)) {
				throw new Error("Network policy violation: IP literals not allowed");
			}
		}

		// Execute fetch
		const response = await originalFetch(url, options);

		// Check response size
		const contentLength = response.headers.get("content-length");
		if (contentLength && parseInt(contentLength) > maxBodyBytes) {
			throw new Error(`Network policy violation: Response too large (${contentLength} > ${maxBodyBytes})`);
		}

		return response;
	};
}

/**
 * Execute Python capsule using Pyodide WASM
 */
async function executePython(
	runId: string,
	_manifest: Capsule,
	_urls: { capsule: string; fsLayers: string[] },
): Promise<void> {
	// TODO: Implement Pyodide execution
	// 1. Load Pyodide WASM from CDN (with SRI verification)
	// 2. Download and mount VFS layers
	// 3. Install Python packages from wheels
	// 4. Execute manifest.entry.path
	// 5. Stream stdout/stderr via postMessage

	postMessage({
		type: "result",
		data: {
			runId,
			type: "stdout",
			chunk: "TODO: Pyodide execution not yet implemented\n",
		},
	} satisfies ResultMessage);
}

// Worker message handler
self.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
	const { type, capsule } = event.data;

	if (type === "execute") {
		await executeCapsule(capsule);
	}
});

// Export for type checking
export type {};
