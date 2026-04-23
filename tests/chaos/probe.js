'use strict';

// Availability / MTTR probe used during chaos scenarios.
// Every INTERVAL_MS a GET /api/info is attempted; success/failure and latency
// are appended to a JSONL file. Run via `node tests/chaos/probe.js <scenario>`.

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SCENARIO = process.argv[2] || 'unknown';
const DURATION_MS = parseInt(process.env.PROBE_DURATION_MS || '120000', 10);
const INTERVAL_MS = parseInt(process.env.PROBE_INTERVAL_MS || '2000', 10);
const BASE_URL = process.env.PROBE_BASE_URL || 'http://localhost:3000';
// modes: 'info' (default, GET /api/info — lightweight, cache-friendly)
//        'login' (POST /api/v1/login — forces DB access, real health)
const MODE = process.env.PROBE_MODE || 'info';
const USERNAME = process.env.RC_USERNAME || 'admin';
const PASSWORD = process.env.RC_PASSWORD || 'AdminPass123!@#';
const OUT_DIR = path.join(__dirname, '..', '..', 'results', 'chaos');
const OUT_FILE = path.join(OUT_DIR, `probe-${SCENARIO}.jsonl`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, '');

const http = axios.create({ timeout: 4000, validateStatus: () => true });

let cachedSession = null;

async function probeInfo() {
  return http.get(`${BASE_URL}/api/info`);
}

async function probeLogin() {
  return http.post(
    `${BASE_URL}/api/v1/login`,
    { user: USERNAME, password: PASSWORD },
    { headers: { 'Content-Type': 'application/json' } },
  );
}

async function ensureSession() {
  if (cachedSession) return cachedSession;
  const res = await http.post(
    `${BASE_URL}/api/v1/login`,
    { user: USERNAME, password: PASSWORD },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status === 200 && res.data && res.data.status === 'success') {
    cachedSession = { userId: res.data.data.userId, authToken: res.data.data.authToken };
  }
  return cachedSession;
}

async function probeAuth() {
  const session = await ensureSession();
  if (!session) {
    const err = new Error('no session');
    err.code = 'NO_SESSION';
    throw err;
  }
  return http.get(`${BASE_URL}/api/v1/channels.list?count=1`, {
    headers: {
      'X-Auth-Token': session.authToken,
      'X-User-Id': session.userId,
    },
  });
}

async function probe() {
  const start = Date.now();
  let status = 0;
  let ok = false;
  let error = null;
  try {
    let res;
    if (MODE === 'login') res = await probeLogin();
    else if (MODE === 'auth') res = await probeAuth();
    else res = await probeInfo();
    status = res.status;
    if (MODE === 'login') {
      ok = res.status === 200 && res.data && res.data.status === 'success';
      if (!ok && res.data) error = res.data.error || res.data.message || null;
    } else if (MODE === 'auth') {
      ok = res.status === 200 && res.data && res.data.success === true;
      if (!ok && res.data) error = res.data.error || res.data.message || null;
    } else {
      ok = res.status >= 200 && res.status < 300;
    }
  } catch (e) {
    error = e.code || e.message;
  }
  const latency = Date.now() - start;
  const record = { ts: new Date().toISOString(), status, ok, latency, error, mode: MODE };
  fs.appendFileSync(OUT_FILE, JSON.stringify(record) + '\n');
  return record;
}

(async function main() {
  const started = Date.now();
  process.stdout.write(`[probe:${SCENARIO}] writing ${OUT_FILE} for ${DURATION_MS}ms\n`);
  while (Date.now() - started < DURATION_MS) {
    const r = await probe();
    process.stdout.write(`[probe:${SCENARIO}] ${r.ts} status=${r.status} ok=${r.ok} lat=${r.latency}ms${r.error ? ' err=' + r.error : ''}\n`);
    const remaining = INTERVAL_MS - (Date.now() - started) % INTERVAL_MS;
    await new Promise((r) => setTimeout(r, remaining));
  }
  process.stdout.write(`[probe:${SCENARIO}] done\n`);
})();
