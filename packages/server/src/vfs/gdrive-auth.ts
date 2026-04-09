/**
 * Google OAuth2 Credential Manager
 *
 * Handles OAuth2 access tokens with automatic refresh.
 * Uses the Google OAuth2 token endpoint.
 */

/**
 * Options for GoogleDriveAuth
 */
export interface GoogleDriveAuthOptions {
  /** OAuth2 access token */
  accessToken: string;
  /** OAuth2 refresh token (enables auto-refresh) */
  refreshToken?: string;
  /** OAuth2 client ID (required for refresh) */
  clientId?: string;
  /** OAuth2 client secret (required for refresh) */
  clientSecret?: string;
  /** Token expiration time (ms since epoch) */
  expiresAt?: number;
  /** Callback when tokens are refreshed */
  onTokenRefresh?: (newAccessToken: string, expiresAt: number) => void | Promise<void>;
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

/**
 * Google OAuth2 token endpoint
 */
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * How soon before expiry to refresh (5 minutes)
 */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Google Drive OAuth2 credential manager
 *
 * Features:
 * - Automatic token refresh
 * - Thread-safe refresh (prevents concurrent refreshes)
 * - Callback for token persistence
 */
export class GoogleDriveAuth {
  private accessToken: string;
  private refreshToken?: string;
  private clientId?: string;
  private clientSecret?: string;
  private expiresAt: number;
  private onTokenRefresh?: (token: string, expiresAt: number) => void | Promise<void>;
  private refreshPromise: Promise<void> | null = null;

  constructor(options: GoogleDriveAuthOptions) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    // Default to 1 hour from now if not specified
    this.expiresAt = options.expiresAt ?? Date.now() + 3600 * 1000;
    this.onTokenRefresh = options.onTokenRefresh;
  }

  /**
   * Get a valid access token, refreshing if needed
   *
   * @returns Valid access token
   * @throws Error if token is expired and refresh is not possible
   */
  async getAccessToken(): Promise<string> {
    // Check if token needs refresh
    if (this.needsRefresh()) {
      if (!this.canRefresh()) {
        if (this.isExpired()) {
          throw new Error(
            "Access token expired and cannot refresh: missing refresh token or client credentials"
          );
        }
        // Token is about to expire but we can't refresh - return current token
        return this.accessToken;
      }

      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  /**
   * Get current access token without checking expiry
   */
  getCurrentToken(): string {
    return this.accessToken;
  }

  /**
   * Check if token needs refresh
   * Returns true if token is expired or will expire within threshold
   */
  needsRefresh(): boolean {
    return Date.now() >= this.expiresAt - REFRESH_THRESHOLD_MS;
  }

  /**
   * Check if token is expired
   */
  isExpired(): boolean {
    return Date.now() >= this.expiresAt;
  }

  /**
   * Check if refresh is possible
   */
  canRefresh(): boolean {
    return !!(this.refreshToken && this.clientId && this.clientSecret);
  }

  /**
   * Force token refresh
   *
   * @throws Error if refresh fails or is not possible
   */
  async refreshAccessToken(): Promise<void> {
    // Prevent concurrent refreshes
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    if (!this.canRefresh()) {
      throw new Error(
        "Cannot refresh: missing refresh token or client credentials"
      );
    }

    this.refreshPromise = this.doRefresh();

    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Update credentials
   */
  updateCredentials(options: Partial<GoogleDriveAuthOptions>): void {
    if (options.accessToken !== undefined) {
      this.accessToken = options.accessToken;
    }
    if (options.refreshToken !== undefined) {
      this.refreshToken = options.refreshToken;
    }
    if (options.clientId !== undefined) {
      this.clientId = options.clientId;
    }
    if (options.clientSecret !== undefined) {
      this.clientSecret = options.clientSecret;
    }
    if (options.expiresAt !== undefined) {
      this.expiresAt = options.expiresAt;
    }
    if (options.onTokenRefresh !== undefined) {
      this.onTokenRefresh = options.onTokenRefresh;
    }
  }

  /**
   * Get expiration time
   */
  getExpiresAt(): number {
    return this.expiresAt;
  }

  /**
   * Get time until expiration in milliseconds
   */
  getTimeToExpiry(): number {
    return Math.max(0, this.expiresAt - Date.now());
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Perform the actual token refresh
   */
  private async doRefresh(): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
      refresh_token: this.refreshToken!,
      grant_type: "refresh_token",
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as {
        error?: string;
        error_description?: string;
      };
      throw new Error(
        `Token refresh failed: ${error.error_description || error.error || response.status}`
      );
    }

    const data = (await response.json()) as TokenRefreshResult;

    // Update credentials
    this.accessToken = data.accessToken;
    this.expiresAt = Date.now() + data.expiresIn * 1000;

    // Notify callback
    if (this.onTokenRefresh) {
      await this.onTokenRefresh(this.accessToken, this.expiresAt);
    }
  }
}

/**
 * Create a Google Drive auth manager
 */
export function createGoogleDriveAuth(
  options: GoogleDriveAuthOptions
): GoogleDriveAuth {
  return new GoogleDriveAuth(options);
}
