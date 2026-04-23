'use strict';

// Chaos scenario C2: MongoDB outage.
// Stops the mongodb container for FAULT_MS and measures how Rocket.Chat
// behaves during the database outage and recovery.

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const FAULT_MS = parseInt(process.env.FAULT_MS || '30000', 10);
const PROBE_DURATION_MS = FAULT_MS + 90000;
const SCENARIO = 'db-outage';

function dockerCompose(args) {
  const r = spawnSync('docker', ['compose', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`docker compose ${args.join(' ')} failed`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async function run() {
  const probe = spawn('node', [path.join(__dirname, '..', 'probe.js'), SCENARIO], {
    env: { ...process.env, PROBE_DURATION_MS: String(PROBE_DURATION_MS) },
    stdio: 'inherit',
  });

  await sleep(15000);
  process.stdout.write(`[${SCENARIO}] stopping mongodb for ${FAULT_MS}ms\n`);
  dockerCompose(['stop', 'mongodb']);
  await sleep(FAULT_MS);
  process.stdout.write(`[${SCENARIO}] starting mongodb\n`);
  dockerCompose(['start', 'mongodb']);

  await new Promise((resolve) => probe.on('exit', resolve));
  process.stdout.write(`[${SCENARIO}] scenario complete\n`);
})();
