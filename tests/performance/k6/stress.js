import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, thresholds } from './config.js';
import { login, authHeaders } from './login.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 30 },
    { duration: '60s', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ...thresholds,
    // stress is allowed slightly more latency budget
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

export function setup() {
  const session = login();
  if (!session) throw new Error('login failed');
  return { session };
}

export default function (data) {
  const headers = authHeaders(data.session);
  const list = http.get(`${BASE_URL}/api/v1/channels.list?count=50`, {
    headers,
    tags: { name: 'channels_list' },
  });
  check(list, { 'channels.list 2xx': (r) => r.status >= 200 && r.status < 300 });
  const info = http.get(`${BASE_URL}/api/info`, { tags: { name: 'info' } });
  check(info, { 'info 200': (r) => r.status === 200 });
  sleep(0.2);
}
