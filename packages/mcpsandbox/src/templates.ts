import type { TemplateValue } from "./types";

const POSITIONAL_PATTERN = /^\$(\d+)(\?)?$/;

function resolveStringTemplate(value: string, args: string[]): unknown {
  if (value === "$*") {
    return [...args];
  }

  const positional = POSITIONAL_PATTERN.exec(value);
  if (!positional) {
    return value;
  }

  const index = Number(positional[1]) - 1;
  const resolved = args[index];

  if (resolved === undefined && positional[2] === "?") {
    return undefined;
  }

  if (resolved === undefined) {
    throw new Error(`Missing required positional argument ${value}`);
  }

  return resolved;
}

export function resolveTemplateValue(
  template: TemplateValue,
  args: string[]
): unknown {
  if (typeof template === "string") {
    return resolveStringTemplate(template, args);
  }

  if (Array.isArray(template)) {
    const resolvedItems: unknown[] = [];

    for (const item of template) {
      const resolved = resolveTemplateValue(item, args);
      if (resolved === undefined) {
        continue;
      }
      if (Array.isArray(resolved)) {
        resolvedItems.push(...resolved);
      } else {
        resolvedItems.push(resolved);
      }
    }

    return resolvedItems;
  }

  if (template && typeof template === "object") {
    const resolvedObject: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(template)) {
      const resolved = resolveTemplateValue(value, args);
      if (resolved !== undefined) {
        resolvedObject[key] = resolved;
      }
    }

    return resolvedObject;
  }

  return template;
}
