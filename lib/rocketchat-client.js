'use strict';

const axios = require('axios');

const DEFAULT_BASE_URL = 'http://localhost:3000';
const MAX_USERNAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_CHANNEL_NAME_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 1;
const CHANNEL_NAME_PATTERN = /^[a-z0-9._-]+$/i;

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`, field);
  }
  if (value.length === 0) {
    throw new ValidationError(`${field} must not be empty`, field);
  }
}

function validateCredentials(username, password) {
  assertNonEmptyString(username, 'username');
  assertNonEmptyString(password, 'password');
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new ValidationError('username too long', 'username');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError('password too short', 'password');
  }
}

function validateChannelName(name) {
  assertNonEmptyString(name, 'name');
  if (name.length > MAX_CHANNEL_NAME_LENGTH) {
    throw new ValidationError('channel name too long', 'name');
  }
  if (!CHANNEL_NAME_PATTERN.test(name)) {
    throw new ValidationError('channel name contains invalid characters', 'name');
  }
}

function validateMessage(roomId, text) {
  assertNonEmptyString(roomId, 'roomId');
  if (typeof text !== 'string') {
    throw new ValidationError('text must be a string', 'text');
  }
  if (text.length === 0) {
    throw new ValidationError('text must not be empty', 'text');
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError('text exceeds max length', 'text');
  }
}

function buildAuthHeaders(session) {
  if (!session || !session.userId || !session.authToken) {
    throw new ValidationError('missing session', 'session');
  }
  return {
    'X-Auth-Token': session.authToken,
    'X-User-Id': session.userId,
  };
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

async function withRetry(fn, { retries = 2, delayMs = 100 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response && error.response.status;
      if (!isRetryableStatus(status) || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}

function normalizeError(error) {
  if (error.response) {
    const { status, data } = error.response;
    return new ApiError(
      (data && data.error) || error.message,
      status,
      data,
    );
  }
  return error;
}

class RocketChatClient {
  constructor({ baseUrl = DEFAULT_BASE_URL, httpClient } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.http = httpClient || axios.create({ baseURL: this.baseUrl, timeout: 10000 });
    this.session = null;
  }

  async login(username, password) {
    validateCredentials(username, password);
    try {
      const response = await withRetry(() =>
        this.http.post('/api/v1/login', { user: username, password }),
      );
      const { data } = response;
      if (!data || data.status !== 'success' || !data.data) {
        throw new ApiError('unexpected login response', response.status, data);
      }
      this.session = {
        userId: data.data.userId,
        authToken: data.data.authToken,
      };
      return this.session;
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async logout() {
    if (!this.session) {
      return { ok: true, alreadyLoggedOut: true };
    }
    const headers = buildAuthHeaders(this.session);
    try {
      await this.http.post('/api/v1/logout', {}, { headers });
      this.session = null;
      return { ok: true, alreadyLoggedOut: false };
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async createChannel(name) {
    validateChannelName(name);
    const headers = buildAuthHeaders(this.session);
    try {
      const response = await this.http.post(
        '/api/v1/channels.create',
        { name },
        { headers },
      );
      return response.data.channel;
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async sendMessage(roomId, text) {
    validateMessage(roomId, text);
    const headers = buildAuthHeaders(this.session);
    try {
      const response = await withRetry(() =>
        this.http.post(
          '/api/v1/chat.sendMessage',
          { message: { rid: roomId, msg: text } },
          { headers },
        ),
      );
      return response.data.message;
    } catch (error) {
      throw normalizeError(error);
    }
  }

  isAuthenticated() {
    return Boolean(this.session && this.session.authToken && this.session.userId);
  }
}

module.exports = {
  RocketChatClient,
  ValidationError,
  ApiError,
  validateCredentials,
  validateChannelName,
  validateMessage,
  buildAuthHeaders,
  isRetryableStatus,
  withRetry,
  normalizeError,
  CHANNEL_NAME_PATTERN,
  MAX_USERNAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
};
