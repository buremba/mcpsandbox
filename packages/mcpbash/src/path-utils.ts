import path from "node:path";

export function toVirtualPath(inputPath: string | undefined): string {
  if (!inputPath || inputPath === ".") {
    return "/";
  }

  const normalized = inputPath.replace(/\\/g, "/");
  const candidate = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const virtualPath = path.posix.normalize(candidate);

  if (virtualPath === "/.." || virtualPath.startsWith("/../")) {
    throw new Error(`Path escapes sandbox root: ${inputPath}`);
  }

  return virtualPath;
}

export function toRealPath(root: string, virtualPath: string): string {
  const relativePath = virtualPath === "/" ? "" : virtualPath.slice(1);
  const realPath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, realPath);

  if (
    relativeToRoot === ".." ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot)
  ) {
    throw new Error(`Path escapes sandbox root: ${virtualPath}`);
  }

  return realPath;
}
