'use strict';

// Post-processes probe-*.jsonl files into per-scenario metrics:
// availability %, MTTR, mean / p95 latency during fault window.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'results', 'chaos');

function readScenarios() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => f.startsWith('probe-') && f.endsWith('.jsonl'))
    .map((f) => ({ name: f.slice('probe-'.length, -'.jsonl'.length), file: path.join(DIR, f) }));
}

function percentile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function analyze(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const records = lines.map((l) => JSON.parse(l));
  const total = records.length;
  const ok = records.filter((r) => r.ok).length;
  const availability = total ? (ok / total) * 100 : 0;
  const latencies = records.filter((r) => r.ok).map((r) => r.latency);
  const firstFailIdx = records.findIndex((r) => !r.ok);
  const recoveryIdx = firstFailIdx === -1 ? -1 : records.slice(firstFailIdx).findIndex((r) => r.ok);
  const mttr = recoveryIdx <= 0 || firstFailIdx === -1
    ? null
    : (new Date(records[firstFailIdx + recoveryIdx].ts) - new Date(records[firstFailIdx].ts));
  return {
    total,
    ok,
    failed: total - ok,
    availability_pct: +availability.toFixed(2),
    mttr_ms: mttr,
    mean_latency_ms: latencies.length ? +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : null,
    p95_latency_ms: percentile(latencies, 95),
    first_failure_ts: firstFailIdx === -1 ? null : records[firstFailIdx].ts,
    first_recovery_ts: recoveryIdx <= 0 || firstFailIdx === -1 ? null : records[firstFailIdx + recoveryIdx].ts,
  };
}

const scenarios = readScenarios();
const summary = {};
for (const s of scenarios) {
  summary[s.name] = analyze(s.file);
}

const out = path.join(DIR, 'chaos-summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2));
process.stdout.write(`Wrote ${out}\n`);
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
