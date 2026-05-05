"""2-Week Notice trigger engine.

Today's Cascade (live, single-month data):
  Low Productivity — S/Hr < 60% store avg AND hours > 100 (14 associates)
  Hidden HG Processors — partial processors at detection boundary (refund 0.10–0.20, S/Hr <60%, gross >5K)

Notice — FT Escalation:
  Immediate: S/Hr <40% → RM + VP (pure failure; HG included — inflated gross makes this worse)
  Standard:  S/Hr 40–60% AND Refund >+20pp → RM (compound; single signal not enough on monthly read)

Tier 3 — Compound Notice (needs consecutive-week data):
  Any 2+ of: S/Hr 60-80% + Refund +10pp + AOV <P25 + Fine Unit% <avg + Net bottom Q
  Excludes HG Processors from compound scoring.

Tier 4 — Recognition:
  S/Hr > 150% store RLH (2 weeks) OR top quartile on 3+ metrics (2 weeks)

FT: hours > 100. PT: all others. No Minimal class.
"""

from __future__ import annotations

from typing import Any

from ..bi import associate_perf


def _hours_class(hours: float | None) -> str:
    if hours is None:
        return "Unknown"
    return "FT" if hours > 100 else "PT"


def _base_row(r: dict, **extra) -> dict[str, Any]:
    hours = r.get("hours")
    return {
        "staff_id": r.get("staff_id"),
        "store": r.get("store"),
        "title": r.get("title"),
        "hours": hours,
        "hours_class": _hours_class(hours),
        "gross_sales": r.get("gross_sales"),
        "s_hr_vs_store": r.get("s_hr_vs_store"),
        "refund_vs_store": r.get("refund_vs_store"),
        "perf_flag": r.get("perf_flag"),
        **extra,
    }


def compute_today(conn) -> list[dict[str, Any]]:
    """Low Productivity associates — current cascade's 14."""
    result = associate_perf.compute(conn)
    rows = [r for r in result["rows"] if r.get("perf_flag") == "Low Productivity"]
    out = [_base_row(r, triggers=[{
        "tier": "Today",
        "label": "Low Prod — S/Hr <60% store RLH",
        "metric": "s_hr_vs_store",
        "value": r.get("s_hr_vs_store"),
        "threshold": 0.60,
        "escalation": "RM",
    }]) for r in rows]
    out.sort(key=lambda r: (r.get("store") or "", r.get("staff_id") or 0))
    return out


def compute_hidden(conn) -> list[dict[str, Any]]:
    """Partial HG Processors at detection boundary — refund 0.10–0.20, S/Hr <60%, gross >5K."""
    result = associate_perf.compute(conn)
    hidden = []
    for r in result["rows"]:
        if r.get("perf_flag") != "HG Processor":
            continue
        s = r.get("s_hr_vs_store")
        rv = r.get("refund_vs_store")
        gross = r.get("gross_sales") or 0
        if (
            s is not None and s < 0.60
            and rv is not None and 0.10 <= rv <= 0.20
            and gross > 5000
        ):
            hours = r.get("hours")
            hidden.append(_base_row(
                r,
                hours_over_100=hours is not None and hours > 100,
                note="HG-inflated gross but still below 60% S/Hr — partial processor at the detection boundary. Can't isolate organic selling performance without tx-level time data.",
            ))
    hidden.sort(key=lambda r: (r.get("store") or "", r.get("s_hr_vs_store") or 1.0))
    return hidden


def compute_notice(conn) -> list[dict[str, Any]]:
    """FT escalation — Immediate (S/Hr <40%) or Standard (S/Hr 40–60% AND Refund >+20pp).
    No HG exclusion — inflated gross raises S/Hr, so falling below threshold is a stronger signal.
    """
    result = associate_perf.compute(conn)
    out = []
    for r in result["rows"]:
        hours = r.get("hours") or 0
        s = r.get("s_hr_vs_store") or 1.0
        rv = r.get("refund_vs_store") or 0.0

        if hours > 100 and s < 0.40:
            severity = "Immediate"
            label = "Extreme — S/Hr <40% RLH"
            escalation = "RM + VP"
        elif hours > 64 and s < 0.60 and rv > 0.20:
            severity = "Standard"
            label = "Low Prod — S/Hr 40–60% + Refund >+20pp"
            escalation = "RM"
        else:
            continue

        out.append({
            **_base_row(r),
            "severity": severity,
            "triggers": [{"tier": "Notice", "label": label, "escalation": escalation}],
        })

    out.sort(key=lambda r: (r.get("s_hr_vs_store") or 1.0))
    return out


def _compute_tier3_signals(r: dict, store_p25_aov: dict, store_avg_fine_pct: dict, store_net_p25: dict) -> list[str]:
    signals = []
    s = r.get("s_hr_vs_store")
    if s is not None and 0.60 <= s < 0.80:
        signals.append("S/Hr")
    rv = r.get("refund_vs_store")
    if rv is not None and rv > 0.10:
        signals.append("Refund")
    store_key = (r.get("store") or "").lower()
    aov = r.get("aov")
    p25_aov = store_p25_aov.get(store_key)
    if aov is not None and p25_aov is not None and aov < p25_aov:
        signals.append("AOV")
    fine_pct = r.get("fine_unit_pct")
    avg_fine = store_avg_fine_pct.get(store_key)
    if fine_pct is not None and avg_fine is not None and fine_pct < avg_fine:
        signals.append("Fine Unit%")
    net = r.get("net_sales")
    p25_net = store_net_p25.get(store_key)
    if net is not None and p25_net is not None and net < p25_net:
        signals.append("Net Sales")
    return signals


def compute_tier3(conn) -> list[dict[str, Any]]:
    """Compound notice — any 2+ of 5 signals. Excludes HG Processors."""
    result = associate_perf.compute(conn)
    rows = result["rows"]

    # Build per-store P25 / averages
    from collections import defaultdict
    import statistics

    store_aovs: dict[str, list[float]] = defaultdict(list)
    store_fine_pcts: dict[str, list[float]] = defaultdict(list)
    store_nets: dict[str, list[float]] = defaultdict(list)

    for r in rows:
        k = (r.get("store") or "").lower()
        aov = r.get("aov")
        if aov is not None:
            store_aovs[k].append(aov)
        fp = r.get("fine_unit_pct")
        if fp is not None:
            store_fine_pcts[k].append(fp)
        net = r.get("net_sales")
        if net is not None:
            store_nets[k].append(net)

    def _p25(vals: list[float]) -> float | None:
        if not vals:
            return None
        s = sorted(vals)
        idx = max(0, int(len(s) * 0.25) - 1)
        return s[idx]

    store_p25_aov = {k: _p25(v) for k, v in store_aovs.items()}
    store_avg_fine_pct = {k: statistics.mean(v) for k, v in store_fine_pcts.items() if v}
    store_net_p25 = {k: _p25(v) for k, v in store_nets.items()}

    out = []
    for r in rows:
        if (r.get("hours") or 0) <= 100:
            continue
        if r.get("perf_flag") == "HG Processor":
            continue
        if (r.get("refund_vs_store") or 0) > 0.20:
            continue  # belongs in Notice, not compound scoring
        signals = _compute_tier3_signals(r, store_p25_aov, store_avg_fine_pct, store_net_p25)
        if len(signals) >= 2:
            out.append(_base_row(r,
                aov=r.get("aov"),
                fine_unit_pct=r.get("fine_unit_pct"),
                net_sales=r.get("net_sales"),
                compound_signals=signals,
                triggers=[{
                    "tier": "Tier 3",
                    "label": f"Compound — {len(signals)}/5 signals",
                    "escalation": "RM + pattern summary",
                }],
            ))
    out.sort(key=lambda r: (-len(r.get("compound_signals") or []), r.get("store") or ""))
    return out


def compute_tier4(conn) -> list[dict[str, Any]]:
    """Recognition — Top Performer associates (S/Hr ≥150% store RLH)."""
    result = associate_perf.compute(conn)
    rows = [r for r in result["rows"] if r.get("perf_flag") == "Top Performer"]
    out = [_base_row(r, fine_unit_pct=r.get("fine_unit_pct"), triggers=[{
        "tier": "Tier 4",
        "label": "Recognition — S/Hr ≥150% store RLH",
        "escalation": "Recognition alert",
    }]) for r in rows]
    out.sort(key=lambda r: (r.get("store") or "", -(r.get("s_hr_vs_store") or 0)))
    return out
