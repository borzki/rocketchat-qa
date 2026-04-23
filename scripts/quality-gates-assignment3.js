#!/usr/bin/env node
'use strict';

/**
 * Evaluates Assignment 3 quality gates against whatever artifacts exist in
 * results/. Intended to be called from CI after each suite. Missing artifacts
 * mean "the suite didn't run in this job" and are skipped, not failed.
 *
 * Usage:
 *   node scripts/quality-gates-assignment3.js            # all available gates
 *   node scripts/quality-gates-assignment3.js --suite=k6
 *   node scripts/quality-gates-assignment3.js --suite=mutation
 *   node scripts/quality-gates-assignment3.js --suite=chaos
 *
 * Exit code: 0 if all evaluated gates pass, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ARGS = new Set(process.argv.slice(2));
const ONLY = [...ARGS].find((a) => a.startsWith('--suite='));
const ONLY_SUITE = ONLY ? ONLY.split('=')[1] : null;

const PERF = path.join(ROOT, 'results', 'performance');
const MUT = path.join(ROOT, 'results', 'mutation', 'mutation-report.json');
const CHAOS = path.join(ROOT, 'results', 'chaos', 'chaos-summary.json');

// ---------- thresholds (source of truth for gates) ----------
const GATES = {
  mutation: {
    scoreMin: 75,            // % — matches test plan target
  },
  k6: {
    // per-scenario thresholds for p95 http_req_duration
    p95MaxMs: { smoke: 800, load: 800, stress: 2000, spike: 3000, endurance: 800 },
    // per-scenario max error rate
    errMax:   { smoke: 0.01, load: 0.01, stress: 0.05, spike: 0.10, endurance: 0.01 },
  },
  chaos: {
    // at least one scenario must complete and min availability must hold
    availMin: { 'api-downtime': 30, 'db-outage': 70, 'network-latency': 95 },
    mttrMaxSeconds: { 'api-downtime': 120, 'db-outage': 90 },
  },
};

// ---------- helpers ----------
const results = []; // {suite, name, status: 'pass'|'fail'|'skip', detail}

function addResult(suite, name, status, detail) {
  results.push({ suite, name, status, detail });
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return null;
  }
}

// ---------- mutation gate ----------
function evaluateMutation() {
  if (ONLY_SUITE && ONLY_SUITE !== 'mutation') return;
  if (!fs.existsSync(MUT)) {
    addResult('mutation', 'stryker score', 'skip', 'mutation-report.json not found');
    return;
  }
  const data = readJson(MUT);
  if (!data) {
    addResult('mutation', 'stryker score', 'fail', 'report unreadable');
    return;
  }
  let killed = 0, survived = 0, timeout = 0, noCov = 0;
  for (const f of Object.values(data.files || {})) {
    for (const m of f.mutants || []) {
      if (m.status === 'Killed') killed += 1;
      else if (m.status === 'Survived') survived += 1;
      else if (m.status === 'Timeout') timeout += 1;
      else if (m.status === 'NoCoverage') noCov += 1;
    }
  }
  const total = killed + survived + timeout + noCov;
  const score = total === 0 ? 0 : ((killed + timeout) / total) * 100;
  const detail = `score=${score.toFixed(2)}% (killed=${killed} survived=${survived} timeout=${timeout} noCov=${noCov} / total=${total})`;
  const status = score >= GATES.mutation.scoreMin ? 'pass' : 'fail';
  addResult('mutation', `score >= ${GATES.mutation.scoreMin}%`, status, detail);
}

// ---------- performance gate ----------
function evaluateK6() {
  if (ONLY_SUITE && ONLY_SUITE !== 'k6') return;
  if (!fs.existsSync(PERF)) {
    addResult('k6', 'any scenario', 'skip', 'results/performance/ missing');
    return;
  }
  const scenarios = ['smoke', 'load', 'stress', 'spike', 'endurance'];
  let any = false;
  for (const name of scenarios) {
    const file = path.join(PERF, `${name}-summary.json`);
    if (!fs.existsSync(file)) continue;
    any = true;
    const d = readJson(file);
    if (!d || !d.metrics) {
      addResult('k6', name, 'fail', 'summary unreadable');
      continue;
    }
    const p95 = (d.metrics.http_req_duration || {})['p(95)'] || 0;
    const errRate = (d.metrics.http_req_failed || {}).rate || 0;
    const p95Max = GATES.k6.p95MaxMs[name];
    const errMax = GATES.k6.errMax[name];
    const p95Ok = p95 <= p95Max;
    const errOk = errRate <= errMax;
    const status = p95Ok && errOk ? 'pass' : 'fail';
    const detail = `p95=${p95.toFixed(2)}ms (limit ${p95Max}ms, ${p95Ok ? 'ok' : 'breach'}); err=${(errRate * 100).toFixed(2)}% (limit ${(errMax * 100).toFixed(2)}%, ${errOk ? 'ok' : 'breach'})`;
    addResult('k6', name, status, detail);
  }
  if (!any) addResult('k6', 'any scenario', 'skip', 'no *-summary.json files present');
}

// ---------- chaos gate ----------
function evaluateChaos() {
  if (ONLY_SUITE && ONLY_SUITE !== 'chaos') return;
  if (!fs.existsSync(CHAOS)) {
    addResult('chaos', 'any scenario', 'skip', 'chaos-summary.json missing');
    return;
  }
  const data = readJson(CHAOS);
  if (!data) {
    addResult('chaos', 'any scenario', 'fail', 'summary unreadable');
    return;
  }
  for (const [name, metrics] of Object.entries(data)) {
    const availMin = GATES.chaos.availMin[name];
    const mttrMax = GATES.chaos.mttrMaxSeconds[name];
    const avail = metrics.availability_pct;
    const mttrSec = metrics.mttr_ms == null ? null : metrics.mttr_ms / 1000;
    const parts = [];
    let ok = true;
    if (availMin != null) {
      const availOk = avail >= availMin;
      parts.push(`avail=${avail}% (min ${availMin}%, ${availOk ? 'ok' : 'breach'})`);
      if (!availOk) ok = false;
    }
    if (mttrMax != null) {
      if (mttrSec == null) {
        parts.push('mttr=n/a (no failures observed)');
      } else {
        const mttrOk = mttrSec <= mttrMax;
        parts.push(`mttr=${mttrSec.toFixed(1)}s (max ${mttrMax}s, ${mttrOk ? 'ok' : 'breach'})`);
        if (!mttrOk) ok = false;
      }
    }
    if (parts.length === 0) parts.push('no thresholds configured — reporting only');
    addResult('chaos', name, ok ? 'pass' : 'fail', parts.join('; '));
  }
}

// ---------- run and report ----------
evaluateMutation();
evaluateK6();
evaluateChaos();

const suites = [...new Set(results.map((r) => r.suite))];
const header = '========== Assignment 3 quality gates ==========';
const footer = '================================================';
const rows = results.map((r) => {
  const badge = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIP';
  return `[${badge}] ${r.suite.padEnd(10)} ${r.name.padEnd(24)} ${r.detail}`;
});
const failed = results.filter((r) => r.status === 'fail');
const passed = results.filter((r) => r.status === 'pass');
const skipped = results.filter((r) => r.status === 'skip');

process.stdout.write(header + '\n');
for (const row of rows) process.stdout.write(row + '\n');
process.stdout.write(`\nSummary: ${passed.length} pass, ${failed.length} fail, ${skipped.length} skip (suites evaluated: ${suites.join(', ') || 'none'})\n`);
process.stdout.write(footer + '\n');

// Write machine-readable summary for CI artifacts.
const outDir = path.join(ROOT, 'results');
fs.writeFileSync(
  path.join(outDir, 'quality-gates-summary.json'),
  JSON.stringify({ results, passed: passed.length, failed: failed.length, skipped: skipped.length }, null, 2),
);

process.exit(failed.length === 0 ? 0 : 1);
