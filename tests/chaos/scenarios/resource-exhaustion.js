'use strict';

// Chaos scenario C5: CPU stress sidecar.
// Spawns a short-lived container that consumes a fraction of a CPU core,
// competing with Rocket.Chat for scheduler time. Because the rocketchat
// container isn't CPU-pinned, this is a coarse stressor but enough to surface
// whether probe latency visibly degrades.

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const FAULT_MS = parseInt(process.env.FAULT_MS || '60000', 10);
const PROBE_DURATION_MS = FAULT_MS + 60000;
const SCENARIO = 'resource-exhaustion';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async function run() {
  const probe = spawn('node', [path.join(__dirname, '..', 'probe.js'), SCENARIO], {
    env: { ...process.env, PROBE_DURATION_MS: String(PROBE_DURATION_MS) },
    stdio: 'inherit',
  });

  await sleep(10000);
  process.stdout.write(`[${SCENARIO}] starting CPU stressor for ${FAULT_MS}ms\n`);
  const stress = spawn('docker', [
    'run', '--rm', '--name', 'chaos-stress',
    '--cpus', '1.0',
    'alpine', 'sh', '-c',
    `apk add --no-cache stress-ng >/dev/null 2>&1 && stress-ng --cpu 2 --timeout ${Math.floor(FAULT_MS / 1000)}s`,
  ], { stdio: 'inherit' });

  await new Promise((resolve) => stress.on('exit', resolve));
  process.stdout.write(`[${SCENARIO}] stressor exited\n`);

  await new Promise((resolve) => probe.on('exit', resolve));
  process.stdout.write(`[${SCENARIO}] scenario complete\n`);
})();
