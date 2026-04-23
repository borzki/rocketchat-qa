import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, thresholds } from './config.js';
import { login, authHeaders } from './login.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds,
};

export function setup() {
  const session = login();
  if (!session) {
    throw new Error('login failed in smoke setup');
  }
  return session;
}

export default function (session) {
  const headers = authHeaders(session);
  const info = http.get(`${BASE_URL}/api/info`, { tags: { name: 'info' } });
  check(info, { 'info 200': (r) => r.status === 200 });
  const channels = http.get(`${BASE_URL}/api/v1/channels.list`, { headers, tags: { name: 'channels_list' } });
  check(channels, { 'channels.list 200': (r) => r.status === 200 });
}
