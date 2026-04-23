'use strict';

// Chaos scenario C1: API downtime.
// Starts a background probe, stops the rocketchat container for FAULT_MS,
// then restarts it and lets the probe observe recovery.

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const FAULT_MS = parseInt(process.env.FAULT_MS || '30000', 10);
const PROBE_DURATION_MS = FAULT_MS + 90000;
const SCENARIO = 'api-downtime';

function dockerCompose(args) {
  const r = spawnSync('docker', ['compose', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} failed`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async function run() {
  process.stdout.write(`[${SCENARIO}] starting probe (duration ${PROBE_DURATION_MS}ms)\n`);
  const probe = spawn('node', [path.join(__dirname, '..', 'probe.js'), SCENARIO], {
    env: { ...process.env, PROBE_DURATION_MS: String(PROBE_DURATION_MS) },
    stdio: 'inherit',
  });

  await sleep(15000);
  process.stdout.write(`[${SCENARIO}] injecting fault: stopping rocketchat for ${FAULT_MS}ms\n`);
  dockerCompose(['stop', 'rocketchat']);
  await sleep(FAULT_MS);
  process.stdout.write(`[${SCENARIO}] recovering: starting rocketchat\n`);
  dockerCompose(['start', 'rocketchat']);

  await new Promise((resolve) => probe.on('exit', resolve));
  process.stdout.write(`[${SCENARIO}] scenario complete\n`);
})();
