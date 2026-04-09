/**
 * QuickJS execution backend for Node.js
 *
 * Uses quickjs-emscripten for sandboxed JavaScript execution.
 * Supports full network access via native fetch.
 */

import { getQuickJS } from "quickjs-emscripten";
import type { ExecutionCapabilities, NetworkPolicy } from "./interface.js";
import { QuickJSBase, type QuickJSBaseOptions, type QuickJSVM } from "./quickjs-base.js";

/**
 * QuickJS execution backend for Node.js
 */
export class QuickJSNodeBackend extends QuickJSBase {
  readonly capabilities: ExecutionCapabilities = {
    network: true,
    filesystem: true,
    containers: false,
    asyncAwait: true,
    maxConcurrency: 10,
  };

  private quickJS: Awaited<ReturnType<typeof getQuickJS>> | null = null;

  constructor(options?: QuickJSBaseOptions) {
    super({ name: "quickjs-node", ...options });
  }

  protected async doInitialize(): Promise<void> {
    // Load QuickJS WASM module
    this.quickJS = await getQuickJS();
  }

  protected async doDispose(): Promise<void> {
    // QuickJS WASM doesn't need explicit cleanup
    this.quickJS = null;
  }

  protected async createVM(): Promise<QuickJSVM> {
    if (!this.quickJS) {
      throw new Error("QuickJS not initialized");
    }

    const ctx = this.quickJS.newContext();
    return ctx as unknown as QuickJSVM;
  }

  protected async doFetch(
    url: string,
    options: RequestInit,
    policy: NetworkPolicy
  ): Promise<Response> {
    const maxBodyBytes = policy.maxBodyBytes ?? 5 * 1024 * 1024; // 5MB
    const maxRedirects = policy.maxRedirects ?? 5;
    const timeoutMs = policy.timeoutMs ?? 30000;

    let redirectCount = 0;
    let currentUrl = url;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      while (redirectCount <= maxRedirects) {
        const response = await fetch(currentUrl, {
          ...options,
          redirect: "manual",
          signal: controller.signal,
        });

        // Handle redirects
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) {
            throw new Error("Redirect without Location header");
          }

          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new Error(`Too many redirects (max: ${maxRedirects})`);
          }

          // Validate redirect URL against policy
          const redirectUrl = new URL(location, currentUrl).toString();
          if (!this.isUrlAllowed(redirectUrl, policy)) {
            throw new Error(`Redirect blocked by policy: ${redirectUrl}`);
          }

          currentUrl = redirectUrl;
          continue;
        }

        // Check response size
        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > maxBodyBytes) {
          throw new Error(
            `Response too large: ${contentLength} bytes (max: ${maxBodyBytes})`
          );
        }

        return response;
      }

      throw new Error(`Maximum redirects exceeded: ${maxRedirects}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a Node.js QuickJS execution backend
 */
export async function createQuickJSNodeBackend(
  options?: QuickJSBaseOptions
): Promise<QuickJSNodeBackend> {
  const backend = new QuickJSNodeBackend(options);
  await backend.initialize();
  return backend;
}
