const REGEX_ESCAPE = /[|\\{}()[\]^$+?.]/g;

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeRelativePath(pattern).replace(REGEX_ESCAPE, "\\$&");
  let regex = "";

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === "*" && next === "*") {
      regex += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += char;
  }

  return new RegExp(`^${regex}$`);
}

export function normalizeRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized === "" || normalized === ".") {
    return "";
  }
  return normalized.replace(/\/+/g, "/").replace(/\/$/, "");
}

export function isPathAllowed(
  path: string,
  allowPatterns: string[],
  denyPatterns: string[]
): boolean {
  const relativePath = normalizeRelativePath(path);
  const candidates =
    relativePath === "" ? ["", "/"] : [relativePath, `${relativePath}/`];

  const allow =
    allowPatterns.length === 0
      ? [globToRegExp("**")]
      : allowPatterns.map(globToRegExp);
  const deny = denyPatterns.map(globToRegExp);

  const matches = (patterns: RegExp[]) =>
    patterns.some((pattern) =>
      candidates.some((candidate) => pattern.test(candidate))
    );

  return matches(allow) && !matches(deny);
}
