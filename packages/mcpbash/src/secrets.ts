import type { SecretRef } from "./types";

export const secret = {
  env(name: string): SecretRef {
    return { kind: "env", name };
  },
};

export function isSecretRef(value: unknown): value is SecretRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    (value as { kind?: unknown }).kind === "env" &&
    "name" in value
  );
}
