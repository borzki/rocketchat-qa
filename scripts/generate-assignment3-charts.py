"""Generate charts for Assignment 3 report from raw test output.

Inputs:
  results/performance/*.json  (k6 summary exports)
  results/chaos/probe-*.jsonl (per-scenario probe streams)
  results/mutation/mutation-report.json (Stryker output)

Outputs:
  docs/assignment3/charts/*.png
"""
from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"matplotlib required: {exc}")

ROOT = Path(__file__).resolve().parent.parent
PERF = ROOT / "results" / "performance"
CHAOS = ROOT / "results" / "chaos"
MUT = ROOT / "results" / "mutation"
OUT = ROOT / "docs" / "assignment3" / "charts"
OUT.mkdir(parents=True, exist_ok=True)


def plot_perf_bars() -> None:
    scenarios = ["smoke", "load", "stress", "spike", "endurance"]
    p50, p95, p99, err = [], [], [], []
    labels = []
    for name in scenarios:
        summary = PERF / f"{name}-summary.json"
        if not summary.exists():
            continue
        data = json.loads(summary.read_text(encoding="utf-8"))
        metrics = data.get("metrics", {})
        dur = metrics.get("http_req_duration", {})
        failed = metrics.get("http_req_failed", {})
        p50.append(dur.get("med", dur.get("p(50)", 0)))
        p95.append(dur.get("p(95)", 0))
        p99.append(dur.get("p(99)", 0))
        err.append((failed.get("rate", 0) or 0) * 100)
        labels.append(name)

    if not labels:
        return

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4))
    x = range(len(labels))
    w = 0.25
    ax1.bar([i - w for i in x], p50, width=w, label="median")
    ax1.bar(x, p95, width=w, label="p95")
    ax1.bar([i + w for i in x], p99, width=w, label="p99")
    ax1.set_xticks(list(x))
    ax1.set_xticklabels(labels)
    ax1.set_ylabel("latency (ms)")
    ax1.set_title("HTTP request duration by scenario")
    ax1.legend()
    ax1.grid(axis="y", alpha=0.3)

    ax2.bar(x, err, color="#c0392b")
    ax2.set_xticks(list(x))
    ax2.set_xticklabels(labels)
    ax2.set_ylabel("error rate (%)")
    ax2.set_title("HTTP error rate by scenario")
    ax2.grid(axis="y", alpha=0.3)

    fig.tight_layout()
    fig.savefig(OUT / "performance-latency-error.png", dpi=130)
    plt.close(fig)


def plot_chaos_timelines() -> None:
    files = sorted(CHAOS.glob("probe-*.jsonl"))
    if not files:
        return
    fig, axes = plt.subplots(len(files), 1, figsize=(11, 2.2 * len(files)), sharex=False)
    if len(files) == 1:
        axes = [axes]
    for ax, f in zip(axes, files):
        name = f.stem[len("probe-"):]
        records = [json.loads(l) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]
        if not records:
            continue
        t0 = datetime.fromisoformat(records[0]["ts"].replace("Z", "+00:00"))
        times = [(datetime.fromisoformat(r["ts"].replace("Z", "+00:00")) - t0).total_seconds() for r in records]
        latencies = [r["latency"] if r["ok"] else 0 for r in records]
        ok_mask = [r["ok"] for r in records]
        ax.plot(times, latencies, "-", color="#2c3e50", linewidth=1, label="latency (ms)")
        for t, ok in zip(times, ok_mask):
            ax.axvspan(t - 1, t + 1, color="#e74c3c" if not ok else "none", alpha=0.3 if not ok else 0)
        ax.set_title(f"chaos scenario: {name}")
        ax.set_ylabel("latency (ms)")
        ax.set_xlabel("seconds since probe start")
        ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(OUT / "chaos-timelines.png", dpi=130)
    plt.close(fig)


def plot_mutation_summary() -> None:
    report = MUT / "mutation-report.json"
    if not report.exists():
        return
    data = json.loads(report.read_text(encoding="utf-8"))
    # Stryker report-schema v2: metrics under files[...] and systemUnderTestMetrics
    system = data.get("systemUnderTestMetrics", {}).get("metrics") or data.get("metrics")
    if not system:
        # fallback compute from files
        killed = survived = timeout = no_cov = 0
        for f in data.get("files", {}).values():
            for m in f.get("mutants", []):
                s = m.get("status")
                if s == "Killed":
                    killed += 1
                elif s == "Survived":
                    survived += 1
                elif s == "Timeout":
                    timeout += 1
                elif s == "NoCoverage":
                    no_cov += 1
        system = {
            "killed": killed,
            "survived": survived,
            "timeout": timeout,
            "noCoverage": no_cov,
        }

    labels = ["Killed", "Survived", "Timeout", "NoCoverage"]
    counts = [system.get("killed", 0), system.get("survived", 0), system.get("timeout", 0), system.get("noCoverage", 0)]
    total = sum(counts)
    score = 0 if total == 0 else (system.get("killed", 0) + system.get("timeout", 0)) / total * 100

    fig, ax = plt.subplots(figsize=(7, 4))
    colors = ["#27ae60", "#c0392b", "#f39c12", "#7f8c8d"]
    ax.bar(labels, counts, color=colors)
    for i, v in enumerate(counts):
        ax.text(i, v + 0.5, str(v), ha="center")
    ax.set_title(f"Mutation results (score {score:.1f}%)")
    ax.set_ylabel("mutants")
    ax.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    fig.savefig(OUT / "mutation-summary.png", dpi=130)
    plt.close(fig)


def main() -> None:
    plot_perf_bars()
    plot_chaos_timelines()
    plot_mutation_summary()
    print(f"charts written to {OUT}")


if __name__ == "__main__":
    main()
