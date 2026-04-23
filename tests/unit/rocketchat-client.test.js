'use strict';

const {
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
  MAX_USERNAME_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
} = require('../../lib/rocketchat-client');

function fakeHttp(responses = {}) {
  const calls = [];
  const impl = async (config) => {
    calls.push(config);
    const key = `${config.method.toUpperCase()} ${config.url}`;
    const handler = responses[key];
    if (!handler) {
      throw Object.assign(new Error('no handler for ' + key), {
        response: { status: 500, data: { error: 'no handler' } },
      });
    }
    return handler(config);
  };
  impl.post = (url, data, opts = {}) =>
    impl({ method: 'post', url, data, headers: opts.headers });
  impl.get = (url, opts = {}) =>
    impl({ method: 'get', url, headers: opts.headers });
  impl.calls = calls;
  return impl;
}

describe('validateCredentials', () => {
  test('accepts valid username and password', () => {
    expect(() => validateCredentials('admin', 'pw')).not.toThrow();
  });

  test('rejects empty username', () => {
    expect(() => validateCredentials('', 'pw')).toThrow(ValidationError);
  });

  test('rejects empty password', () => {
    expect(() => validateCredentials('admin', '')).toThrow(ValidationError);
  });

  test('rejects non-string username', () => {
    expect(() => validateCredentials(123, 'pw')).toThrow(ValidationError);
  });

  test('rejects non-string password', () => {
    expect(() => validateCredentials('admin', 42)).toThrow(ValidationError);
  });

  test('rejects username longer than MAX_USERNAME_LENGTH', () => {
    const long = 'a'.repeat(MAX_USERNAME_LENGTH + 1);
    expect(() => validateCredentials(long, 'pw')).toThrow(/username too long/);
  });

  test('accepts username exactly MAX_USERNAME_LENGTH', () => {
    const boundary = 'a'.repeat(MAX_USERNAME_LENGTH);
    expect(() => validateCredentials(boundary, 'pw')).not.toThrow();
  });
});

describe('validateChannelName', () => {
  test('accepts valid channel name', () => {
    expect(() => validateChannelName('my-chan_01')).not.toThrow();
  });

  test('rejects empty name', () => {
    expect(() => validateChannelName('')).toThrow(ValidationError);
  });

  test('rejects name with spaces', () => {
    expect(() => validateChannelName('bad name')).toThrow(/invalid characters/);
  });

  test('rejects name with special chars', () => {
    expect(() => validateChannelName('bad@name')).toThrow(/invalid characters/);
  });

  test('rejects name exceeding MAX_CHANNEL_NAME_LENGTH', () => {
    expect(() => validateChannelName('a'.repeat(MAX_CHANNEL_NAME_LENGTH + 1))).toThrow(/too long/);
  });

  test('accepts name exactly MAX_CHANNEL_NAME_LENGTH', () => {
    expect(() => validateChannelName('a'.repeat(MAX_CHANNEL_NAME_LENGTH))).not.toThrow();
  });
});

describe('validateMessage', () => {
  test('accepts valid message', () => {
    expect(() => validateMessage('ROOM1', 'hello')).not.toThrow();
  });

  test('rejects empty roomId', () => {
    expect(() => validateMessage('', 'hi')).toThrow(/roomId/);
  });

  test('rejects empty message text', () => {
    expect(() => validateMessage('ROOM1', '')).toThrow(/text must not be empty/);
  });

  test('rejects non-string text', () => {
    expect(() => validateMessage('ROOM1', null)).toThrow(/text must be a string/);
  });

  test('rejects message exceeding MAX_MESSAGE_LENGTH', () => {
    const long = 'x'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(() => validateMessage('ROOM1', long)).toThrow(/exceeds max length/);
  });

  test('accepts message at exactly MAX_MESSAGE_LENGTH', () => {
    const boundary = 'x'.repeat(MAX_MESSAGE_LENGTH);
    expect(() => validateMessage('ROOM1', boundary)).not.toThrow();
  });
});

describe('buildAuthHeaders', () => {
  test('returns X-Auth-Token and X-User-Id', () => {
    const headers = buildAuthHeaders({ userId: 'u1', authToken: 't1' });
    expect(headers).toEqual({ 'X-Auth-Token': 't1', 'X-User-Id': 'u1' });
  });

  test('throws when session is null', () => {
    expect(() => buildAuthHeaders(null)).toThrow(ValidationError);
  });

  test('throws when authToken missing', () => {
    expect(() => buildAuthHeaders({ userId: 'u1' })).toThrow(/missing session/);
  });

  test('throws when userId missing', () => {
    expect(() => buildAuthHeaders({ authToken: 't1' })).toThrow(/missing session/);
  });
});

describe('isRetryableStatus', () => {
  test('429 is retryable', () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  test('500 is retryable', () => {
    expect(isRetryableStatus(500)).toBe(true);
  });

  test('503 is retryable', () => {
    expect(isRetryableStatus(503)).toBe(true);
  });

  test('200 is not retryable', () => {
    expect(isRetryableStatus(200)).toBe(false);
  });

  test('400 is not retryable', () => {
    expect(isRetryableStatus(400)).toBe(false);
  });

  test('401 is not retryable', () => {
    expect(isRetryableStatus(401)).toBe(false);
  });

  test('600 is not retryable (outside 5xx)', () => {
    expect(isRetryableStatus(600)).toBe(false);
  });
});

describe('withRetry', () => {
  test('returns value on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { retries: 2, delayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on 503 and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { retries: 2, delayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('does not retry on 400', async () => {
    const fn = jest.fn().mockRejectedValue({ response: { status: 400 } });
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('gives up after retries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
    await expect(withRetry(fn, { retries: 2, delayMs: 1 })).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('normalizeError', () => {
  test('wraps axios error with response into ApiError', () => {
    const err = { message: 'boom', response: { status: 401, data: { error: 'unauthorized' } } };
    const normalized = normalizeError(err);
    expect(normalized).toBeInstanceOf(ApiError);
    expect(normalized.status).toBe(401);
    expect(normalized.message).toBe('unauthorized');
  });

  test('returns the original error when response absent', () => {
    const err = new Error('network down');
    expect(normalizeError(err)).toBe(err);
  });

  test('falls back to message when data.error missing', () => {
    const err = { message: 'boom', response: { status: 500, data: {} } };
    const normalized = normalizeError(err);
    expect(normalized.message).toBe('boom');
  });
});

describe('RocketChatClient.login', () => {
  test('stores session on successful login', async () => {
    const http = fakeHttp({
      'POST /api/v1/login': async () => ({
        status: 200,
        data: { status: 'success', data: { userId: 'u1', authToken: 't1' } },
      }),
    });
    const client = new RocketChatClient({ httpClient: http });
    const session = await client.login('admin', 'pw');
    expect(session).toEqual({ userId: 'u1', authToken: 't1' });
    expect(client.isAuthenticated()).toBe(true);
  });

  test('throws ApiError on 401', async () => {
    const http = fakeHttp({
      'POST /api/v1/login': async () => {
        const err = new Error('denied');
        err.response = { status: 401, data: { error: 'Unauthorized' } };
        throw err;
      },
    });
    const client = new RocketChatClient({ httpClient: http });
    await expect(client.login('admin', 'bad')).rejects.toBeInstanceOf(ApiError);
    expect(client.isAuthenticated()).toBe(false);
  });

  test('rejects empty credentials without calling http', async () => {
    const http = fakeHttp({});
    const client = new RocketChatClient({ httpClient: http });
    await expect(client.login('', 'pw')).rejects.toBeInstanceOf(ValidationError);
    expect(http.calls).toHaveLength(0);
  });

  test('throws ApiError when status field is not "success"', async () => {
    const http = fakeHttp({
      'POST /api/v1/login': async () => ({
        status: 200,
        data: { status: 'error', message: 'wat' },
      }),
    });
    const client = new RocketChatClient({ httpClient: http });
    await expect(client.login('admin', 'pw')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('RocketChatClient.logout', () => {
  test('clears session on successful logout', async () => {
    const http = fakeHttp({
      'POST /api/v1/logout': async () => ({ status: 200, data: { status: 'success' } }),
    });
    const client = new RocketChatClient({ httpClient: http });
    client.session = { userId: 'u1', authToken: 't1' };
    const result = await client.logout();
    expect(result.alreadyLoggedOut).toBe(false);
    expect(client.isAuthenticated()).toBe(false);
  });

  test('no-op when not logged in', async () => {
    const http = fakeHttp({});
    const client = new RocketChatClient({ httpClient: http });
    const result = await client.logout();
    expect(result).toEqual({ ok: true, alreadyLoggedOut: true });
    expect(http.calls).toHaveLength(0);
  });
});

describe('RocketChatClient.createChannel', () => {
  test('sends auth headers and returns channel', async () => {
    const http = fakeHttp({
      'POST /api/v1/channels.create': async (config) => {
        expect(config.headers['X-Auth-Token']).toBe('t1');
        expect(config.headers['X-User-Id']).toBe('u1');
        return { status: 200, data: { channel: { _id: 'r1', name: config.data.name } } };
      },
    });
    const client = new RocketChatClient({ httpClient: http });
    client.session = { userId: 'u1', authToken: 't1' };
    const chan = await client.createChannel('my-chan');
    expect(chan).toEqual({ _id: 'r1', name: 'my-chan' });
  });

  test('rejects invalid channel name without calling http', async () => {
    const http = fakeHttp({});
    const client = new RocketChatClient({ httpClient: http });
    client.session = { userId: 'u1', authToken: 't1' };
    await expect(client.createChannel('bad name')).rejects.toBeInstanceOf(ValidationError);
    expect(http.calls).toHaveLength(0);
  });

  test('rejects when not authenticated', async () => {
    const http = fakeHttp({});
    const client = new RocketChatClient({ httpClient: http });
    await expect(client.createChannel('ok')).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('RocketChatClient.sendMessage', () => {
  test('sends message and returns stored record', async () => {
    const http = fakeHttp({
      'POST /api/v1/chat.sendMessage': async (config) => ({
        status: 200,
        data: { message: { _id: 'm1', msg: config.data.message.msg, rid: config.data.message.rid } },
      }),
    });
    const client = new RocketChatClient({ httpClient: http });
    client.session = { userId: 'u1', authToken: 't1' };
    const msg = await client.sendMessage('ROOM1', 'hello');
    expect(msg).toEqual({ _id: 'm1', msg: 'hello', rid: 'ROOM1' });
  });

  test('rejects empty message', async () => {
    const http = fakeHttp({});
    const client = new RocketChatClient({ httpClient: http });
    client.session = { userId: 'u1', authToken: 't1' };
    await expect(client.sendMessage('ROOM1', '')).rejects.toBeInstanceOf(ValidationError);
    expect(http.calls).toHaveLength(0);
  });

  test('retries on 503 then succeeds', async () => {
    let call = 0;
    const http = fakeHttp({
      'POST /api/v1/chat.sendMessage': async () => {
        call += 1;
        if (call === 1) {
          const err = new Error('unavailable');
          err.response = { status: 503, data: {} };
          throw err;
        }
        return { status: 200, data: { message: { _id: 'm1' } } };
      },
    });
    const client = new RocketChatClient({ httpClient: http });
    client.session = { userId: 'u1', authToken: 't1' };
    const msg = await client.sendMessage('ROOM1', 'hi');
    expect(msg._id).toBe('m1');
    expect(call).toBe(2);
  });
});

describe('RocketChatClient.isAuthenticated', () => {
  test('false when no session', () => {
    const client = new RocketChatClient({ httpClient: fakeHttp({}) });
    expect(client.isAuthenticated()).toBe(false);
  });

  test('true when session complete', () => {
    const client = new RocketChatClient({ httpClient: fakeHttp({}) });
    client.session = { userId: 'u1', authToken: 't1' };
    expect(client.isAuthenticated()).toBe(true);
  });

  test('false when token missing', () => {
    const client = new RocketChatClient({ httpClient: fakeHttp({}) });
    client.session = { userId: 'u1' };
    expect(client.isAuthenticated()).toBe(false);
  });
});
