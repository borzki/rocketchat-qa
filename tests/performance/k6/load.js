import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, thresholds } from './config.js';
import { login, authHeaders } from './login.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '60s', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds,
};

export function setup() {
  const session = login();
  if (!session) throw new Error('login failed');
  // create one channel to use for sendMessage probes
  const res = http.post(
    `${BASE_URL}/api/v1/channels.create`,
    JSON.stringify({ name: `perf-load-${Date.now()}` }),
    { headers: authHeaders(session), tags: { name: 'channels_create' } },
  );
  const channel = res.status === 200 ? res.json().channel : null;
  return { session, roomId: channel ? channel._id : 'GENERAL' };
}

export default function (data) {
  const headers = authHeaders(data.session);

  const list = http.get(`${BASE_URL}/api/v1/channels.list`, { headers, tags: { name: 'channels_list' } });
  check(list, { 'channels.list 200': (r) => r.status === 200 });

  const payload = JSON.stringify({ message: { rid: data.roomId, msg: `perf ${__ITER}` } });
  const msg = http.post(`${BASE_URL}/api/v1/chat.sendMessage`, payload, {
    headers,
    tags: { name: 'chat_sendMessage' },
  });
  check(msg, { 'sendMessage 200': (r) => r.status === 200 });

  sleep(0.5);
}
