# Assignment 3 — Experimental Testing Plan

**Project:** Rocket.Chat QA
**Course:** Advanced QA
**Author:** Aldiyar Sagidolla
**Date:** 2026-04-23
**Repository:** https://github.com/illus1um/rocketchat-qa

---

## 1. Scope

This plan defines three experimental testing activities required by Assignment 3, carried out against the Rocket.Chat instance provisioned in `docker-compose.yml` (Rocket.Chat latest + MongoDB 8 replica set).

| Activity | Target | Tool | Output |
|---|---|---|---|
| Performance | Rocket.Chat REST API | k6 (fallback: autocannon) | Latency, throughput, error rate |
| Mutation | Custom client library `lib/rocketchat-client.js` | Stryker | Mutation score |
| Chaos | Docker Compose stack | docker CLI + toxiproxy | Availability, MTTR |

## 2. High-risk Modules (from midterm risk analysis)

| # | Module | Risk Score | Rationale for inclusion |
|---|---|---:|---|
| 1 | Real-time Messaging | 20 | P0 — highest risk, accepts empty / 50KB payloads |
| 2 | REST API | 16 | P0 — primary attack surface, 150+ endpoints |
| 3 | Authentication & Authorization | 15 | P0 — security-critical, gates everything |

All experimental tests in this plan target these three modules.

## 3. Performance Testing

### 3.1 Scenarios

| Scenario | VUs (virtual users) | Duration | Purpose |
|---|---:|---|---|
| Smoke | 1 | 30s | Verify endpoints respond before real run |
| Load (normal) | 10 | 2m | Simulate everyday traffic |
| Stress | ramp 10 → 50 | 3m | Find the breaking point |
| Spike | 5 → 60 → 5 | 90s | Sudden burst recovery |
| Endurance | 10 | 5m | Memory / resource leaks |

### 3.2 Endpoints exercised

| Module | Endpoint | Verb |
|---|---|---|
| Auth | `/api/v1/login` | POST |
| REST API | `/api/v1/channels.list` | GET |
| Messaging | `/api/v1/chat.sendMessage` | POST |

### 3.3 Thresholds (SLOs)

| Metric | Threshold | Justification |
|---|---|---|
| `http_req_duration` p95 | < 800 ms | Conservative for self-hosted chat |
| `http_req_failed` | < 1% | Production-like error budget |
| `iteration_duration` p95 | < 2 s | End-to-end scenario latency |

A scenario passes only if every threshold holds.

## 4. Mutation Testing

### 4.1 Target

Rocket.Chat source code is not owned by this project, so traditional mutation testing of the SUT is not applicable. Instead, a custom test-client library [`lib/rocketchat-client.js`](../../lib/rocketchat-client.js) wraps login, channel and messaging primitives with:

* input validation (empty strings, length caps, type checks)
* token caching
* retry policy
* error normalization

This library is exercised by dedicated unit tests [`tests/unit/rocketchat-client.test.js`](../../tests/unit/rocketchat-client.test.js) using mocked axios, plus integration tests reusing it.

### 4.2 Mutation operators (Stryker defaults)

* Arithmetic operators (`+` → `-`)
* Logical operators (`==` → `!=`, `&&` → `||`)
* Conditionals (`if (x)` → `if (true)`)
* Boundary / equality (`>=` → `>`)
* String literals
* Return values (`return x` → `return undefined`)
* Block removal

### 4.3 Scoring

```
Mutation Score = Killed / (Killed + Survived + NoCoverage) × 100
```

Target: **≥ 75%** overall; survivors analysed and mapped to missing assertions.

## 5. Chaos / Fault Injection

### 5.1 Scenarios

| # | Fault | Method | Duration | Module impacted |
|---|---|---|---:|---|
| C1 | API downtime | `docker compose stop rocketchat` | 30 s | REST API |
| C2 | DB outage | `docker compose stop mongodb` | 30 s | All (RC depends on Mongo) |
| C3 | Network latency | toxiproxy 500 ms + 100 ms jitter | 60 s | REST API |
| C4 | Packet loss | toxiproxy 10% down | 60 s | REST API |
| C5 | CPU stress | `docker run --cpus 0.2 stress-ng` sidecar | 60 s | Whole host |

### 5.2 Metrics captured per scenario

| Metric | Definition |
|---|---|
| Availability (%) | `successful_probes / total_probes` during fault window |
| MTTR (s) | Time from fault clear → first successful probe |
| Error propagation | Which dependent calls failed and what error surfaced |
| Graceful degradation | Did client get a useful error or timeout / crash? |

Probing is driven by `tests/chaos/probe.js` which issues `GET /api/info` every 2 s and logs result + timestamp.

## 6. Environment

| Component | Version |
|---|---|
| OS | Windows 11 Pro 26200 |
| Node.js | 24.14.1 |
| Python | 3.14.4 |
| Docker | 29.2.1 |
| Docker Compose | 5.1.0 |
| Rocket.Chat | `latest` (pulled from registry.rocket.chat) |
| MongoDB | 8 (replica set `rs0`) |
| k6 | ≥ 0.50 (installed via Chocolatey / Scoop) |
| Stryker | `@stryker-mutator/core` ^8 |

All tests run on the same host. Network faults use toxiproxy container added via `docker-compose.chaos.yml` overlay.

## 7. CI Integration

Three jobs in [`.github/workflows/assignment3.yml`](../../.github/workflows/assignment3.yml):

| Job | Trigger | Content |
|---|---|---|
| `unit-and-mutation` | every push touching `lib/` or `tests/unit/`; weekly schedule for the full Stryker pass | Jest unit tests (52) + Stryker (`schedule` or `workflow_dispatch`) + mutation quality gate |
| `performance-gate` | every push to the same paths + `workflow_dispatch` | Brings up the Rocket.Chat Docker stack, runs k6 smoke + load, evaluates the k6 quality gate |
| `chaos` | `workflow_dispatch` with `run_chaos=true` | Brings up the stack + toxiproxy overlay, runs api-downtime / db-outage / network-latency, evaluates the chaos quality gate |

Each job runs [`scripts/quality-gates-assignment3.js`](../../scripts/quality-gates-assignment3.js)
after its suite. The script reads whatever JSON outputs are present in
`results/`, applies the thresholds listed in §8, prints a PASS/FAIL line per
gate, writes `results/quality-gates-summary.json` for artifact upload, and
exits non-zero if any gate breaches. Skipped suites do not fail the gate.

### Thresholds enforced by the gate script

| Gate | Threshold |
|---|---|
| Mutation score | ≥ 75% |
| k6 smoke / load | p95 `http_req_duration` < 800 ms, `http_req_failed` < 1% |
| k6 stress | p95 < 2 s, err < 5% |
| k6 spike | p95 < 3 s, err < 10% |
| Chaos api-downtime | availability ≥ 30%, MTTR ≤ 120 s |
| Chaos db-outage | availability ≥ 70%, MTTR ≤ 90 s |
| Chaos network-latency | availability ≥ 95% |

Stryker itself also enforces `thresholds.break = 75` so the mutation step
fails fast if the score collapses, independent of the gate script.

## 8. Deliverables

1. `tests/performance/k6/*.js` — all four scenarios as code.
2. `lib/rocketchat-client.js` + `tests/unit/*.test.js` — mutation target.
3. `stryker.config.mjs` — mutation config.
4. `tests/chaos/*.js` + `docker-compose.chaos.yml` — fault injection.
5. `results/**` — raw JSON / text output.
6. `docs/assignment3/assignment3-report.md` — 4–6 page experimental report.
7. `scripts/generate-assignment3-charts.py` — metric visualisation.
