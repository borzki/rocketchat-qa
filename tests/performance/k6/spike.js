import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, thresholds } from './config.js';
import { login, authHeaders } from './login.js';

export const options = {
  stages: [
    { duration: '15s', target: 5 },
    { duration: '10s', target: 60 },
    { duration: '30s', target: 60 },
    { duration: '10s', target: 5 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    ...thresholds,
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.10'],
  },
};

export function setup() {
  const session = login();
  if (!session) throw new Error('login failed');
  return { session };
}

export default function (data) {
  const headers = authHeaders(data.session);
  const res = http.get(`${BASE_URL}/api/v1/channels.list?count=25`, {
    headers,
    tags: { name: 'channels_list' },
  });
  check(res, { 'channels.list ok': (r) => r.status === 200 });
  sleep(0.1);
}
