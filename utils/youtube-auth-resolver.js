'use strict';

const { google } = require('googleapis');
const { CredentialManager } = require('./credential-manager');
const { Logger } = require('./logger');

const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];

/**
 * Resolves YouTube OAuth2 client with offline refresh token capability.
 * Checks environment variables first, then falls back to CredentialManager config files.
 * Never logs or exposes credentials.
 */
class YouTubeAuthResolver {
  constructor(options = {}) {
    this.logger = options.logger || new Logger('YouTubeAuthResolver');
    this.credentialManager = options.credentialManager || new CredentialManager();
  }

  /**
   * Checks if required OAuth credentials and refresh token are present.
   * @returns {Promise<{ hasCredentials: boolean, hasRefreshToken: boolean, source: string }>}
   */
  async checkCredentialStatus() {
    const envClientId = process.env.YOUTUBE_CLIENT_ID;
    const envClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const envRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (envClientId && envClientSecret) {
      return {
        hasCredentials: true,
        hasRefreshToken: Boolean(envRefreshToken),
        source: 'environment'
      };
    }

    try {
      await this.credentialManager.loadCredentials();
      await this.credentialManager.loadTokens();
      const fileHasCreds = Boolean(this.credentialManager.credentials?.youtube?.client_id && this.credentialManager.credentials?.youtube?.client_secret);
      const fileHasRefresh = Boolean(this.credentialManager.tokens?.youtube?.refresh_token);

      if (fileHasCreds) {
        return {
          hasCredentials: true,
          hasRefreshToken: fileHasRefresh,
          source: 'config_files'
        };
      }
    } catch (_err) {
      // Config files not found or unreadable
    }

    return {
      hasCredentials: false,
      hasRefreshToken: false,
      source: 'none'
    };
  }

  /**
   * Resolves an authenticated Google OAuth2 client with refresh capability.
   * @param {Object} [options={}]
   * @returns {Promise<google.auth.OAuth2>}
   */
  async resolveAuth(options = {}) {
    if (options.auth) {
      return options.auth;
    }

    // 1. Environment variables
    const envClientId = process.env.YOUTUBE_CLIENT_ID;
    const envClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const envRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    const envRedirectUri = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:8080/oauth2callback';

    if (envClientId && envClientSecret) {
      const oauth2Client = new google.auth.OAuth2(
        envClientId,
        envClientSecret,
        envRedirectUri
      );

      if (envRefreshToken) {
        oauth2Client.setCredentials({
          refresh_token: envRefreshToken
        });
        return oauth2Client;
      }

      this.logger.warn('YouTube client ID and secret found in environment, but YOUTUBE_REFRESH_TOKEN is missing');
      return oauth2Client;
    }

    // 2. Fall back to CredentialManager config files
    try {
      await this.credentialManager.loadCredentials();
      await this.credentialManager.loadTokens();
      if (this.credentialManager.credentials?.youtube?.client_id && this.credentialManager.tokens?.youtube) {
        return this.credentialManager.getYouTubeAuth();
      }
    } catch (err) {
      this.logger.debug(`Could not load YouTube auth from config files: ${err.message}`);
    }

    const error = new Error('YouTube OAuth credentials not configured. Provide YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REFRESH_TOKEN in environment or run credentials setup.');
    error.code = 'YOUTUBE_AUTH_MISSING';
    throw error;
  }

  /**
   * Generates one-time browser consent URL for channel authorization.
   * @param {Object} [options={}]
   * @returns {string} Consent URL
   */
  generateAuthUrl(options = {}) {
    const clientId = options.clientId || process.env.YOUTUBE_CLIENT_ID || this.credentialManager.credentials?.youtube?.client_id;
    const clientSecret = options.clientSecret || process.env.YOUTUBE_CLIENT_SECRET || this.credentialManager.credentials?.youtube?.client_secret;
    const redirectUri = options.redirectUri || process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:8080/oauth2callback';

    if (!clientId || !clientSecret) {
      throw new Error('Cannot generate auth URL: YouTube Client ID and Client Secret are required.');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: YOUTUBE_OAUTH_SCOPES
    });
  }

  /**
   * Exchanges an authorization code for tokens and persists them securely.
   * @param {string} code
   * @param {Object} [options={}]
   * @returns {Promise<Object>} Token info
   */
  async exchangeCodeForTokens(code, options = {}) {
    const clientId = options.clientId || process.env.YOUTUBE_CLIENT_ID || this.credentialManager.credentials?.youtube?.client_id;
    const clientSecret = options.clientSecret || process.env.YOUTUBE_CLIENT_SECRET || this.credentialManager.credentials?.youtube?.client_secret;
    const redirectUri = options.redirectUri || process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:8080/oauth2callback';

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    this.credentialManager.credentials.youtube = {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [redirectUri]
    };
    this.credentialManager.tokens.youtube = tokens;

    await this.credentialManager.saveCredentials();
    await this.credentialManager.saveTokens();

    return {
      hasRefreshToken: Boolean(tokens.refresh_token),
      expiryDate: tokens.expiry_date
    };
  }

  /**
   * Returns an initialized google.youtube('v3') client instance.
   * @param {Object} [options={}]
   * @returns {Promise<google.youtube>}
   */
  async getYouTubeClient(options = {}) {
    if (options.client) return options.client;
    const auth = await this.resolveAuth(options);
    return google.youtube({ version: 'v3', auth });
  }
}

module.exports = {
  YouTubeAuthResolver,
  YOUTUBE_OAUTH_SCOPES
};
