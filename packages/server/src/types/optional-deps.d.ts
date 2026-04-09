/**
 * Type declarations for optional dependencies
 *
 * These modules are dynamically imported and may not be installed.
 * The declarations allow TypeScript to compile without errors.
 */

declare module "quickjs-emscripten-core" {
  export function newQuickJSWASMModuleFromVariant(variant: any): Promise<any>;
}

declare module "@jitl/quickjs-wasmfile-release-sync" {
  const variant: any;
  export default variant;
}

declare module "isomorphic-git" {
  export function clone(options: any): Promise<void>;
  export function fetch(options: any): Promise<any>;
  export function checkout(options: any): Promise<void>;
  export function resolveRef(options: any): Promise<string>;
}

declare module "isomorphic-git/http/web/index.js" {
  const http: any;
  export default http;
}
