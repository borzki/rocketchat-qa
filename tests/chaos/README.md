# Chaos / fault injection scenarios

Each scenario runs a background probe that hits `GET /api/info` every 2 s and
appends the result to `results/chaos/probe-<scenario>.jsonl`. While the probe
runs, the scenario script injects a fault and restores service.

## Scenarios

| File | Fault | Mechanism |
|---|---|---|
| `scenarios/api-downtime.js` | Rocket.Chat process stopped | `docker compose stop rocketchat` |
| `scenarios/db-outage.js` | MongoDB stopped | `docker compose stop mongodb` |
| `scenarios/network-latency.js` | 500 ms ± 100 ms latency | toxiproxy toxic on downstream |
| `scenarios/resource-exhaustion.js` | CPU saturation | `stress-ng` in sidecar container |

## Running

```bash
# one scenario
node tests/chaos/scenarios/api-downtime.js

# all scenarios + summary
node tests/chaos/run-all.js

# analyse existing probe logs
node tests/chaos/analyze.js
```

## Prerequisites

* `docker-compose.yml` stack running (`docker compose up -d`).
* For `network-latency`: the chaos overlay must be up too:
  `docker compose -f docker-compose.yml -f docker-compose.chaos.yml up -d toxiproxy`.
  The probe then points at `http://localhost:3001` (toxiproxy listener).

## Metrics

`analyze.js` produces `results/chaos/chaos-summary.json` with:

* `availability_pct` — `successful / total` probes.
* `mttr_ms` — time between first failed probe and first successful probe after fault clears.
* `mean_latency_ms`, `p95_latency_ms` — for successful probes only.
