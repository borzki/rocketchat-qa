'use strict';

// Orchestrates all chaos scenarios in sequence.
// Usage: node tests/chaos/run-all.js [scenario ...]
// Scenarios: api-downtime, db-outage, network-latency, resource-exhaustion

const { spawnSync } = require('child_process');
const path = require('path');

const ALL = ['api-downtime', 'db-outage', 'network-latency', 'resource-exhaustion'];
const requested = process.argv.slice(2).filter(Boolean);
const scenarios = requested.length ? requested : ALL;

for (const name of scenarios) {
  const script = path.join(__dirname, 'scenarios', `${name}.js`);
  process.stdout.write(`\n==> running chaos scenario: ${name}\n`);
  const res = spawnSync('node', [script], { stdio: 'inherit' });
  if (res.status !== 0) {
    process.stderr.write(`scenario ${name} failed with status ${res.status}\n`);
  }
  // let the system breathe between scenarios
  const cool = spawnSync('node', ['-e', 'setTimeout(()=>{}, 10000)'], { stdio: 'ignore' });
  void cool;
}

const analyze = spawnSync('node', [path.join(__dirname, 'analyze.js')], { stdio: 'inherit' });
process.exit(analyze.status || 0);
