'use strict';

// Chaos scenario C3: Network latency via toxiproxy.
// Assumes the chaos overlay is already running (toxiproxy on :3001/:8474).
// Probes go through http://localhost:3001 (the toxiproxy listener).

const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

const FAULT_MS = parseInt(process.env.FAULT_MS || '60000', 10);
const PROBE_DURATION_MS = FAULT_MS + 90000;
const LATENCY_MS = parseInt(process.env.LATENCY_MS || '500', 10);
const JITTER_MS = parseInt(process.env.JITTER_MS || '100', 10);
const SCENARIO = 'network-latency';
const TOXIPROXY_API = 'http://localhost:8474';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function addLatencyToxic() {
  await axios.post(`${TOXIPROXY_API}/proxies/rocketchat/toxics`, {
    name: 'latency_down',
    type: 'latency',
    stream: 'downstream',
    toxicity: 1.0,
    attributes: { latency: LATENCY_MS, jitter: JITTER_MS },
  });
}

async function removeLatencyToxic() {
  await axios.delete(`${TOXIPROXY_API}/proxies/rocketchat/toxics/latency_down`).catch(() => {});
}

(async function run() {
  const probe = spawn('node', [path.join(__dirname, '..', 'probe.js'), SCENARIO], {
    env: {
      ...process.env,
      PROBE_DURATION_MS: String(PROBE_DURATION_MS),
      PROBE_BASE_URL: 'http://localhost:3001',
    },
    stdio: 'inherit',
  });

  await sleep(15000);
  process.stdout.write(`[${SCENARIO}] injecting ${LATENCY_MS}ms ±${JITTER_MS}ms latency\n`);
  await addLatencyToxic();
  await sleep(FAULT_MS);
  process.stdout.write(`[${SCENARIO}] removing latency toxic\n`);
  await removeLatencyToxic();

  await new Promise((resolve) => probe.on('exit', resolve));
  process.stdout.write(`[${SCENARIO}] scenario complete\n`);
})();
