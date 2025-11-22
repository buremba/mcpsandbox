/**
 * Browser filesystem layer extractor
 * Downloads and extracts fsLayers (code, deps, mounts) to OPFS
 */

import { unzipSync } from "fflate";
import type { FSLayer } from "@onemcp/shared";
import type { OPFSVirtualFilesystem } from "./opfs-vfs.js";

export interface LayerExtractionResult {
	layerId: string;
	filesExtracted: number;
	bytesExtracted: number;
}

export class BrowserLayerExtractor {
	constructor(private vfs: OPFSVirtualFilesystem) {}

	/**
	 * Download and extract all fsLayers from URLs
	 */
	async extractLayers(
		fsLayers: FSLayer[],
		baseUrl: string,
	): Promise<LayerExtractionResult[]> {
		const results: LayerExtractionResult[] = [];

		for (const layer of fsLayers) {
			const result = await this.extractLayer(layer, baseUrl);
			results.push(result);
		}

		return results;
	}

	/**
	 * Download and extract a single fsLayer
	 */
	async extractLayer(
		layer: FSLayer,
		baseUrl: string,
	): Promise<LayerExtractionResult> {
		// Download layer zip file
		const layerUrl = `${baseUrl}/${layer.path}`;
		const response = await fetch(layerUrl);

		if (!response.ok) {
			throw new Error(
				`Failed to download layer ${layer.id}: ${response.statusText}`,
			);
		}

		const zipBuffer = await response.arrayBuffer();

		// Verify SHA-256 hash
		const hashBuffer = await crypto.subtle.digest("SHA-256", zipBuffer);
		const hashHex = Array.from(new Uint8Array(hashBuffer))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		if (hashHex !== layer.sha256) {
			throw new Error(
				`Layer ${layer.id} hash mismatch. Expected: ${layer.sha256}, Got: ${hashHex}`,
			);
		}

		// Unzip the layer
		const files = unzipSync(new Uint8Array(zipBuffer));

		// Determine target directory
		// - For code layer (no target), extract to root /
		// - For mount layers (with target), extract to target path
		const targetDir = layer.target || "/";

		// Extract files to OPFS
		let filesExtracted = 0;
		let bytesExtracted = 0;

		for (const [filePath, fileData] of Object.entries(files)) {
			// Construct full path: targetDir + filePath
			const fullPath = this.joinPath(targetDir, filePath);

			// Ensure parent directory exists
			const dirPath = this.getDirectoryPath(fullPath);
			if (dirPath !== "/") {
				await this.vfs.mkdir(dirPath, { recursive: true });
			}

			// Write file (fileData is Uint8Array, cast as Buffer for compatibility)
			await this.vfs.writeFile(fullPath, fileData as unknown as Buffer);

			filesExtracted++;
			bytesExtracted += (fileData as Uint8Array).byteLength;
		}

		return {
			layerId: layer.id,
			filesExtracted,
			bytesExtracted,
		};
	}

	/**
	 * Join paths, ensuring proper slashes
	 */
	private joinPath(...parts: string[]): string {
		const joined = parts
			.map((p) => p.replace(/^\/+|\/+$/g, "")) // Remove leading/trailing slashes
			.filter((p) => p.length > 0)
			.join("/");

		return "/" + joined;
	}

	/**
	 * Get directory path from file path
	 */
	private getDirectoryPath(filePath: string): string {
		const parts = filePath.split("/").filter((p) => p.length > 0);
		if (parts.length <= 1) return "/";

		parts.pop(); // Remove filename
		return "/" + parts.join("/");
	}
}
