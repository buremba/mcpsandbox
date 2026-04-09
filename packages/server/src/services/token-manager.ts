/**
 * Token Manager Service
 *
 * Handles JWE (JSON Web Encryption) tokens for secure API key transmission.
 * Uses jose library for JWT/JWE operations.
 *
 * Security model:
 * - API keys are encrypted using AES-256-GCM (A256GCM)
 * - Encryption key is stored server-side only
 * - Tokens include rate limit configuration
 * - Tokens are signed to prevent tampering
 */

/// <reference lib="dom" />

import {
  EncryptJWT,
  jwtDecrypt,
  type JWTPayload,
  type KeyLike,
} from "jose";

/**
 * Rate limit configuration for a user
 */
export interface RateLimitConfig {
  /** Maximum tokens per request */
  maxTokensPerRequest: number;
  /** Maximum tokens per day */
  maxTokensPerDay: number;
  /** Maximum requests per minute */
  maxRequestsPerMinute: number;
  /** Maximum requests per day */
  maxRequestsPerDay: number;
}

/**
 * Widget token payload (encrypted)
 */
export interface WidgetTokenPayload extends JWTPayload {
  /** API key (encrypted in JWE) */
  apiKey: string;
  /** LLM provider */
  provider: "openai" | "anthropic" | "google";
  /** Custom base URL (e.g., Cloudflare AI Gateway, Azure OpenAI) */
  baseUrl?: string;
  /** Rate limits */
  limits: RateLimitConfig;
  /** Developer identifier (for namespacing) */
  developerId: string;
  /** User identifier */
  sub: string;
  /** Token ID (for revocation) */
  jti: string;
}

/**
 * Options for generating a token
 */
export interface GenerateTokenOptions {
  /** API key to encrypt */
  apiKey: string;
  /** LLM provider */
  provider: "openai" | "anthropic" | "google";
  /** Custom base URL (e.g., Cloudflare AI Gateway, Azure OpenAI) */
  baseUrl?: string;
  /** Developer ID */
  developerId: string;
  /** User ID */
  userId: string;
  /** Rate limits */
  limits: RateLimitConfig;
  /** Token expiration (e.g., "30d", "7d", "24h") */
  expiresIn?: string;
}

/**
 * Token Manager Service
 */
export class TokenManager {
  private encryptionKey: Uint8Array | null = null;
  private keyLike: KeyLike | null = null;

  /**
   * Create a new TokenManager
   * @param encryptionSecret Secret for encrypting tokens (should be 32 bytes for A256GCM)
   */
  constructor(private encryptionSecret: string) {}

  /**
   * Initialize the token manager
   * Derives the encryption key from the secret
   */
  async initialize(): Promise<void> {
    // Derive a 256-bit key from the secret using PBKDF2
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.encryptionSecret),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );

    // Use a fixed salt for deterministic key derivation
    // In production, you might want to use a random salt stored separately
    const salt = encoder.encode("relay-mcp-token-encryption-v1");

    this.keyLike = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    // Export for jose - keyLike is already a CryptoKey from deriveKey
    const exported = await crypto.subtle.exportKey("raw", this.keyLike as CryptoKey);
    this.encryptionKey = new Uint8Array(exported);
  }

  /**
   * Generate an encrypted widget token
   */
  async generateToken(options: GenerateTokenOptions): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("TokenManager not initialized");
    }

    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();

    // Parse expiration
    let expirationTime = "30d";
    if (options.expiresIn) {
      expirationTime = options.expiresIn;
    }

    const payload = {
      apiKey: options.apiKey,
      provider: options.provider,
      baseUrl: options.baseUrl,
      developerId: options.developerId,
      sub: options.userId,
      limits: options.limits,
      jti,
      iat: now,
    };

    // Create encrypted JWT (JWE)
    const token = await new EncryptJWT(payload)
      .setProtectedHeader({
        alg: "dir", // Direct encryption (key is used directly)
        enc: "A256GCM", // AES-256-GCM encryption
      })
      .setIssuedAt()
      .setExpirationTime(expirationTime)
      .encrypt(this.encryptionKey);

    return token;
  }

  /**
   * Decrypt and validate a widget token
   */
  async decryptToken(token: string): Promise<WidgetTokenPayload> {
    if (!this.encryptionKey) {
      throw new Error("TokenManager not initialized");
    }

    try {
      const { payload } = await jwtDecrypt(token, this.encryptionKey, {
        contentEncryptionAlgorithms: ["A256GCM"],
        keyManagementAlgorithms: ["dir"],
      });

      // Validate required fields
      const required = ["apiKey", "provider", "developerId", "sub", "limits"];
      for (const field of required) {
        if (!(field in payload)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      return payload as unknown as WidgetTokenPayload;
    } catch (error) {
      if (error instanceof Error && error.message.includes("expired")) {
        throw new Error("Token expired");
      }
      throw new Error(`Invalid token: ${error}`);
    }
  }

  /**
   * Refresh a token with new expiration
   * Returns a new token with the same payload but new expiration
   */
  async refreshToken(token: string, expiresIn: string = "30d"): Promise<string> {
    const payload = await this.decryptToken(token);

    return this.generateToken({
      apiKey: payload.apiKey,
      provider: payload.provider,
      developerId: payload.developerId,
      userId: payload.sub,
      limits: payload.limits,
      expiresIn,
    });
  }

  /**
   * Validate token without decrypting (checks structure and expiration)
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      await this.decryptToken(token);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a token manager instance
 */
export async function createTokenManager(encryptionSecret: string): Promise<TokenManager> {
  const manager = new TokenManager(encryptionSecret);
  await manager.initialize();
  return manager;
}
