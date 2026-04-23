import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, USERNAME, PASSWORD } from './config.js';

export function login() {
  const payload = JSON.stringify({ user: USERNAME, password: PASSWORD });
  const params = { headers: { 'Content-Type': 'application/json' }, tags: { name: 'login' } };
  const res = http.post(`${BASE_URL}/api/v1/login`, payload, params);
  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login returned token': (r) => {
      try {
        const body = r.json();
        return body && body.status === 'success' && body.data && body.data.authToken;
      } catch (_e) {
        return false;
      }
    },
  });
  if (!ok) {
    // allow the scenario to continue; threshold on http_req_failed will catch this
    return null;
  }
  const body = res.json();
  return { userId: body.data.userId, authToken: body.data.authToken };
}

export function authHeaders(session) {
  return {
    'Content-Type': 'application/json',
    'X-Auth-Token': session.authToken,
    'X-User-Id': session.userId,
  };
}

export function warmupSleep() {
  sleep(Math.random() * 0.5);
}
