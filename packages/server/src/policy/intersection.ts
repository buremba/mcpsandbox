/**
 * Policy intersection - merging server defaults with client overrides (spec §9)
 */

import type { Policy, NetworkPolicy, FilesystemPolicy, LimitsPolicy } from "@onemcp/shared";

/**
 * Compute intersection of two policies
 * Client can only make policy MORE restrictive, never more permissive
 */
export function intersectPolicies(
  serverPolicy: Policy,
  clientPolicy?: Partial<Policy>
): Policy {
  if (!clientPolicy) return serverPolicy;

  return {
    network: intersectNetwork(serverPolicy.network, clientPolicy.network),
    filesystem: intersectFilesystem(
      serverPolicy.filesystem,
      clientPolicy.filesystem
    ),
    limits: intersectLimits(serverPolicy.limits, clientPolicy.limits),
  };
}

function intersectNetwork(
  server: NetworkPolicy,
  client?: Partial<NetworkPolicy>
): NetworkPolicy {
  if (!client) return server;

  return {
    // Allowed domains: intersection (both must allow)
    allowedDomains: client.allowedDomains
      ? server.allowedDomains.filter((d) =>
          client.allowedDomains?.includes(d)
        )
      : server.allowedDomains,

    // Denied domains: union (deny if either denies)
    deniedDomains: [
      ...server.deniedDomains,
      ...(client.deniedDomains || []),
    ],

    // Restrictions: union (true if either is true)
    denyIpLiterals: server.denyIpLiterals || (client.denyIpLiterals ?? false),
    blockPrivateRanges:
      server.blockPrivateRanges || (client.blockPrivateRanges ?? false),

    // Limits: minimum (most restrictive)
    maxBodyBytes: Math.min(
      server.maxBodyBytes,
      client.maxBodyBytes ?? Infinity
    ),
    maxRedirects: Math.min(
      server.maxRedirects,
      client.maxRedirects ?? Infinity
    ),
  };
}

function intersectFilesystem(
  server: FilesystemPolicy,
  client?: Partial<FilesystemPolicy>
): FilesystemPolicy {
  if (!client) return server;

  return {
    // Readonly: intersection (both must allow)
    readonly: client.readonly
      ? server.readonly.filter((p) => client.readonly?.includes(p))
      : server.readonly,

    // Writable: intersection (both must allow)
    writable: client.writable
      ? server.writable.filter((p) => client.writable?.includes(p))
      : server.writable,
  };
}

function intersectLimits(
  server: LimitsPolicy,
  client?: Partial<LimitsPolicy>
): LimitsPolicy {
  if (!client) return server;

  return {
    // All limits: minimum (most restrictive)
    timeoutMs: Math.min(server.timeoutMs, client.timeoutMs ?? Infinity),
    memMb: Math.min(server.memMb, client.memMb ?? Infinity),
    stdoutBytes: Math.min(server.stdoutBytes, client.stdoutBytes ?? Infinity),
  };
}
