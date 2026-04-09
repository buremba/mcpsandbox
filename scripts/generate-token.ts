#!/usr/bin/env tsx
/**
 * Token Generator Script
 *
 * Generates JWE tokens for the relay-mcp proxy using the TokenManager.
 *
 * Usage:
 *   npx tsx scripts/generate-token.ts --api-key=sk-xxx --provider=openai
 *   npx tsx scripts/generate-token.ts --api-key=sk-xxx --provider=openai --base-url=https://gateway.ai.cloudflare.com/v1/xxx/xxx/openai
 *   npx tsx scripts/generate-token.ts --api-key=sk-xxx --provider=openai --max-tokens-per-request=8192 --max-requests-per-minute=20
 *
 * Rate Limit Flags:
 *   --max-tokens-per-request=N   Max tokens per request (default: 4096)
 *   --max-tokens-per-day=N       Max tokens per day (default: 100000)
 *   --max-requests-per-minute=N  Max requests per minute (default: 10)
 *   --max-requests-per-day=N     Max requests per day (default: 1000)
 *
 * Environment variables:
 *   ENCRYPTION_SECRET - Required encryption secret (same as deployed worker)
 */

import { TokenManager } from "../packages/server/src/services/token-manager.js";

async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Token Generator - Generate JWE tokens for relay-mcp proxy

Usage:
  npx tsx scripts/generate-token.ts --api-key=sk-xxx [options]

Required:
  --api-key=KEY          API key to encrypt in token (or set API_KEY env var)

Options:
  --provider=PROVIDER    LLM provider: openai, anthropic, google (default: openai)
  --base-url=URL         Custom base URL (e.g., Cloudflare AI Gateway)
  --developer-id=ID      Developer identifier (default: demo-developer)
  --user-id=ID           User identifier (default: demo-user)
  --expires-in=DURATION  Token expiration: 1h, 24h, 7d, 30d, 90d, 365d (default: 30d)

Rate Limits:
  --max-tokens-per-request=N   Max tokens per request (default: 4096)
  --max-tokens-per-day=N       Max tokens per day (default: 100000)
  --max-requests-per-minute=N  Max requests per minute (default: 10)
  --max-requests-per-day=N     Max requests per day (default: 1000)

Environment:
  ENCRYPTION_SECRET      Encryption secret (must match deployed worker)

Examples:
  # Basic usage
  ENCRYPTION_SECRET=mysecret npx tsx scripts/generate-token.ts --api-key=sk-xxx

  # With custom rate limits
  npx tsx scripts/generate-token.ts --api-key=sk-xxx --max-requests-per-minute=5 --max-tokens-per-day=50000

  # With Cloudflare AI Gateway
  npx tsx scripts/generate-token.ts --api-key=sk-xxx --base-url=https://gateway.ai.cloudflare.com/v1/xxx/openai
`);
    process.exit(0);
  }

  // Parse arguments
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=').slice(1).join('='); // Handle URLs with = in them
  };

  const getNumArg = (name: string, defaultValue: number): number => {
    const value = getArg(name);
    if (value === undefined) return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
  };

  const apiKey = getArg('api-key') || process.env.API_KEY;
  const provider = getArg('provider') as 'openai' | 'anthropic' | 'google' || 'openai';
  const baseUrl = getArg('base-url') || process.env.BASE_URL;
  const developerId = getArg('developer-id') || 'demo-developer';
  const userId = getArg('user-id') || 'demo-user';
  const expiresIn = getArg('expires-in') || '30d';
  const encryptionSecret = process.env.ENCRYPTION_SECRET || 'relay-mcp-encryption-secret-32byte';

  // Rate limits
  const maxTokensPerRequest = getNumArg('max-tokens-per-request', 4096);
  const maxTokensPerDay = getNumArg('max-tokens-per-day', 100000);
  const maxRequestsPerMinute = getNumArg('max-requests-per-minute', 10);
  const maxRequestsPerDay = getNumArg('max-requests-per-day', 1000);

  if (!apiKey) {
    console.error('Error: API key is required');
    console.error('Usage: npx tsx scripts/generate-token.ts --api-key=sk-xxx --provider=openai');
    console.error('Run with --help for more options');
    process.exit(1);
  }

  console.log('Generating token...');
  console.log(`  Provider: ${provider}`);
  if (baseUrl) {
    console.log(`  Base URL: ${baseUrl}`);
  }
  console.log(`  Developer ID: ${developerId}`);
  console.log(`  User ID: ${userId}`);
  console.log(`  Expires In: ${expiresIn}`);
  console.log(`  Rate Limits:`);
  console.log(`    - Max Tokens/Request: ${maxTokensPerRequest}`);
  console.log(`    - Max Tokens/Day: ${maxTokensPerDay}`);
  console.log(`    - Max Requests/Minute: ${maxRequestsPerMinute}`);
  console.log(`    - Max Requests/Day: ${maxRequestsPerDay}`);

  const tokenManager = new TokenManager(encryptionSecret);
  await tokenManager.initialize();

  const token = await tokenManager.generateToken({
    apiKey,
    provider,
    baseUrl,
    developerId,
    userId,
    limits: {
      maxTokensPerRequest,
      maxTokensPerDay,
      maxRequestsPerMinute,
      maxRequestsPerDay,
    },
    expiresIn,
  });

  console.log('\n--- Generated Token ---');
  console.log(token);
  console.log('\n--- Environment Variable ---');
  console.log(`VITE_RELAY_PROXY_TOKEN="${token}"`);
  console.log('\n--- Usage in Widget Config ---');
  console.log(`{
  model: {
    provider: "${provider}",
    name: "gpt-4o-mini",
    secure: {
      token: "${token.substring(0, 50)}...",
      proxyEndpoint: "https://relay-mcp.buremba.workers.dev/chat",
    },
  }
}`);
}

main().catch(console.error);
