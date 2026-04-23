import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, thresholds } from './config.js';
import { login, authHeaders } from './login.js';

export const options = {
  vus: 10,
  duration: '5m',
  thresholds,
};

export function setup() {
  const session = login();
  if (!session) throw new Error('login failed');
  const res = http.post(
    `${BASE_URL}/api/v1/channels.create`,
    JSON.stringify({ name: `perf-endurance-${Date.now()}` }),
    { headers: authHeaders(session), tags: { name: 'channels_create' } },
  );
  const channel = res.status === 200 ? res.json().channel : null;
  return { session, roomId: channel ? channel._id : 'GENERAL' };
}

export default function (data) {
  const headers = authHeaders(data.session);
  const list = http.get(`${BASE_URL}/api/v1/channels.list?count=10`, {
    headers,
    tags: { name: 'channels_list' },
  });
  check(list, { 'channels.list 200': (r) => r.status === 200 });
  const msg = http.post(
    `${BASE_URL}/api/v1/chat.sendMessage`,
    JSON.stringify({ message: { rid: data.roomId, msg: `endurance ${__ITER}` } }),
    { headers, tags: { name: 'chat_sendMessage' } },
  );
  check(msg, { 'sendMessage 200': (r) => r.status === 200 });
  sleep(1);
}
