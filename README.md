# Rocket.Chat QA — course project

[![Assignment 3 — Experimental Testing](https://github.com/illus1um/rocketchat-qa/actions/workflows/assignment3.yml/badge.svg)](https://github.com/illus1um/rocketchat-qa/actions/workflows/assignment3.yml)
[![Midterm CI](https://github.com/illus1um/rocketchat-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/illus1um/rocketchat-qa/actions/workflows/ci.yml)

This repo accumulates three assignments from the Advanced QA course:

| # | Focus | Entry point |
|---|---|---|
| 1 | Risk-based test strategy | [`docs/risk-assessment.md`](docs/risk-assessment.md) |
| 2 | UI automation (Playwright) | [`tests/assignment2/`](tests/assignment2/) + [`docs/assignment2-report.md`](docs/assignment2-report.md) |
| Midterm | API test suite (Jest + axios) against a live Rocket.Chat | [`tests/api/`](tests/api/) + [`docs/midterm-report.md`](docs/midterm-report.md) |
| 3 | Experimental engineering — performance, mutation, chaos | [`docs/assignment3/assignment3-report.md`](docs/assignment3/assignment3-report.md) |

**For Assignment 3 specifically**, see:

* [`docs/assignment3/test-plan.md`](docs/assignment3/test-plan.md) — methodology
* [`lib/rocketchat-client.js`](lib/rocketchat-client.js) + [`tests/unit/`](tests/unit/) — mutation target (80.51% score)
* [`tests/performance/k6/`](tests/performance/k6/) — k6 load/stress/spike/endurance scenarios
* [`tests/chaos/`](tests/chaos/) + [`docker-compose.chaos.yml`](docker-compose.chaos.yml) — chaos scenarios
* [`results/`](results/) — raw JSON + JSONL output for all experiments
* [`.github/workflows/assignment3.yml`](.github/workflows/assignment3.yml) — CI integration

---

# Assignment 2 UI Automation Suite

Practice assignment repository for browser automation scenarios:

1. Search functionality
2. Login and logout functionality
3. Flight booking with a title checkpoint

The project uses Playwright and local demo web pages stored in this repository so the tests stay stable and pass both locally and in GitHub Actions.

## Project Structure

```text
demo-apps/
  search/           Local search demo page
  auth/             Local login/logout demo page
  flights/          Local flight booking demo page
docs/
  assignment2-report.md
  test-cases.md
  locators-and-ci.md
tests/assignment2/
  assignment2.spec.ts
.github/workflows/ci.yml
playwright.config.ts
package.json
```

## Run Locally

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:e2e
```

To open the HTML report after a local run:

```bash
npx playwright show-report
```

## What Is Covered

| Requirement | Status |
|---|---|
| Search functionality automation | Implemented |
| Login and logout automation | Implemented |
| Flight booking automation | Implemented |
| CSS selectors | Implemented |
| XPath selectors | Implemented |
| GitHub CI | Implemented |

## CI

GitHub Actions workflow is available in `.github/workflows/ci.yml`.

Current CI improvements:

- Runs on `push`, `pull_request`, and manual `workflow_dispatch`
- Cancels outdated in-progress runs for the same branch
- Uploads Playwright HTML report
- Uploads raw `test-results` artifacts with screenshots and traces
- Uploads JUnit XML report for machine-readable test results
