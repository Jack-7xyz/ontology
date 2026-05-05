"""Revenue Decomposition — mechanic #2.

Per-store revenue waterfall: Gross → Deduped Gross → Net → Ontology Net Revenue.
The gap between Gross and Deduped Gross is the HG gift-card recycling
double-count (a return paid in GC, then re-spent, hits gross twice). Ontology Net
Revenue strips that double-count so the VP can separate organic growth from
GC-recycling inflation.

Distortion lives in Gross, not Net. Net Sales itself is a correct P&L — GC
inflation and return offsets cancel algebraically. The waterfall exists to
surface *which* top-gross stores are recycling-inflated (Irvine Spectrum at
7.7% GC/Gross) and which are organic.

Computation reuses `bi/hg_intel.compute(conn)` — single source of truth across
HG Intelligence (BI dashboard) and this mechanic. Every waterfall field and
every flag rationale lives in `hg_intel.META`.

Source-of-truth notes
---------------------
- Deck `s_m2_insights` + `s_m2_table` (scripts/append_mechanic_slides.py) —
  5 insight bullets + 5-row threshold table ported verbatim.
- Thresholds note (.GCC/.../notes/mechanic-revenue-decomp-thresholds.md) —
  "why" rationale per threshold, integrated into `algorithms[].reasoning`.
- Weaknesses — 9-item DRAFT in reconciliation note (notes/mechanic-rev_decomp-
  reconciled.md); stub in mechanics-algo-weaknesses.md pending Jack's QA.
- Compute reuses hg_intel.compute — no arithmetic re-derivation.
"""

from __future__ import annotations

from typing import Any

from ..bi import hg_intel


META: dict[str, Any] = {
    "id": "rev_decomp",
    "label": "Revenue Decomposition",
    "deck_hook": (
        "Gross double-counts HG gift-card recycling — a return paid in GC, "
        "then re-spent, hits top-line twice. Ontology Net Revenue strips the "
        "double-count so the VP sees organic growth. Distortion lives in "
        "Gross, not Net."
    ),
    "description": (
        "Per-store revenue waterfall with four stages — Gross → Deduped "
        "Gross → Net Sales → Ontology Net Revenue. Deduped Gross removes the "
        "Est GC Revenue double-count from the top line; Ontology Net Revenue "
        "removes it from Net Sales. Per-store flag bar shows Recycle Rate, "
        "GC/Gross %, and HG Risk Score at-a-glance. Click any row to drill "
        "into HG Intelligence anchored on the store."
    ),
    "upstream_bi": ["hg_intel", "attribution_intel"],
    "utility": (
        "One waterfall tells the VP which top-gross stores are GC-recycling "
        "inflated and which are organic. Ontology Net Revenue is the fair "
        "comparison baseline — ranking by Gross alone rewards recycling "
        "inflation. Irvine Spectrum leads gross at $512K but 7.7% of that is "
        "GC re-spend; the decomp makes that visible without hunting."
    ),
    "logic_overview": (
        "For each store: compute Est GC Revenue = GC Issued × Store AOV "
        "(upper-bound estimate of the GC recycling double-count). Deduct "
        "from Gross to get Deduped Gross (organic top-line). Net Sales is "
        "the standard P&L (Gross + Discounts + Returns). Ontology Net Revenue "
        "= Net Sales − Est GC Revenue (organic baseline after deductions). "
        "Recycle Rate = Est GC Rev / |Returns| (high = good: HG retaining "
        "return-$ as reissued GC; flagged fleet-relative, top/mid/bottom third). "
        "GC/Gross % = Est GC Rev / Gross — fleet-wide inflation metric; useful "
        "for the revenue waterfall but not a per-store behavior flag (high-volume "
        "stores naturally carry higher GC/Gross). HG Risk Score "
        "is an additive 0-3 composite (missing-rate >10%, PII non-compliance, "
        "GC volume >10). Same logic as the HG Intelligence dashboard — one source "
        "of truth."
    ),
    # Deck s_m2_insights bullets (append_mechanic_slides.py:210-223) — numbers
    # ported from live Jan-2026 fleet snapshot so the page matches the deck.
    "key_insights": [
        "Fleet: $12.82M gross, $378K Est GC Revenue (2.9% inflation), "
        "$10.50M net. Ontology Net Revenue $10.12M — the organic baseline.",
        "Irvine Spectrum — #1 by gross at $512K, but 36.7% Recycle Rate and "
        "7.7% GC/Gross: ~$40K of the top-line is recycling. Ranking by "
        "Ontology Net Revenue surfaces this kind of inflation.",
        "Only 3 of 120 stores above 6% GC/Gross (red) — the risk is "
        "concentrated, not distributed. Most of the fleet has minimal "
        "inflation. The decomp's value is finding the 3.",
        "Recycle Rate fleet median 15.3%; flagging is fleet-relative (top-third "
        "green, bottom-third red) — not hardcoded. High Recycle = HG program "
        "retaining return-$ as reissued GC. Positive signal.",
        "HG Risk Score distribution: 0→40 · 1→48 · 2→31 · 3→1. Composite "
        "of missing-rate >10%, any PII non-compliance, and GC volume >10. "
        "Sorts triage toward stores needing operational attention.",
    ],
    # 5 rows — verbatim from deck s_m2_table (append_mechanic_slides.py:326-338),
    # with `reasoning` extended from the thresholds note (peer-relative vs
    # operational framing). Full rationale in notes/mechanic-revenue-decomp-
    # thresholds.md.
    "algorithms": [
        {
            "domain":   "Recycle Rate",
            "metric":   "est_gc_revenue / |returns|",
            "green":    "top-33% fleet",
            "yellow":   "mid-33% fleet",
            "red":      "bottom-33% fleet",
            "reasoning": "Fleet-relative percentile (higher is better). "
                         "Thresholds computed live from the cohort — no "
                         "hardcoded cutoff. Controls for category/format mix; "
                         "a store is green/red relative to peers, not an "
                         "absolute retention target.",
        },
        {
            "domain":   "GC / Gross %",
            "metric":   "est_gc_revenue / gross_sales",
            "green":    "<3%",
            "yellow":   "3-6%",
            "red":      ">6%",
            "reasoning": "Primary use: fleet-wide revenue waterfall — quantifies "
                         "total inflation ($378K stripped from gross). Per-store "
                         "flag correlates with volume (high-gross stores carry "
                         "higher GC/Gross naturally); use Recycle Rate and Missing "
                         "Rate as the per-store behavior signals instead. >6% "
                         "(≈3× fleet median 2.2%) still surfaces material outliers "
                         "worth reviewing in context.",
        },
        {
            "domain":   "Missing Rate",
            "metric":   "missing_units / qty_expected",
            "green":    "0%",
            "yellow":   "1-10%",
            "red":      ">10%",
            "reasoning": "Operational judgment line, not statistical. Normal "
                         "shrink ~1-2%; >5% is bad; >10% is almost always "
                         "process/theft, not miscount. Below 10% the false-"
                         "positive rate from count error swamps the signal.",
        },
        {
            "domain":   "Inv Risk Flag",
            "metric":   "missing_units > 5 AND inv_variance > 0",
            "green":    "—",
            "yellow":   "—",
            "red":      "YES",
            "reasoning": "Compound gate, AND is the whole point. High missing "
                         "alone could be shrink elsewhere; over-count alone "
                         "could be miscount. Together = units physically "
                         "present but flagged missing — classic sweethearting "
                         "/ unrecorded return / ticket-switch pattern.",
        },
        {
            "domain":   "HG Risk Score",
            "metric":   "1pt ea: missing_rate>10%, PII non-compliant, gc>10",
            "green":    "0",
            "yellow":   "1",
            "red":      "≥2",
            "reasoning": "Additive 0-3 composite. Tiered triage, not "
                         "statistical cutoff. Any single flag alone is noisy; "
                         "co-occurrence is what's diagnostic. Caveat: the "
                         "gc>10 floor can fire for low-GC/Gross stores.",
        },
    ],
    # 9 weaknesses — DRAFT (pending Jack's QA append to mechanics-algo-
    # weaknesses.md). Deck footer caveat + hg_intel module caveats + thresholds
    # note gaps. Mirror Red Count's 1-line rule + 1-line v2 fix pattern.
    "weaknesses": [
        {
            "rule":   "Est GC Revenue is estimated (GC issued × store AOV), "
                      "not measured. Assumes every GC redeems once at issue-"
                      "store avg ticket. Fashion Island's 209%-of-spec "
                      "overshoot cases are where the formula breaks.",
            "v2_fix": "Transaction-level payment-method tagging — GC "
                      "redemptions become real events with real dollars. Est "
                      "GC Rev stops being a formula.",
        },
        {
            "rule":   "No cross-store GC flow — GC issued at Store A, "
                      "redeemed at Store C is invisible. All inflation is "
                      "assigned to issuing store regardless of where "
                      "redemption actually lands.",
            "v2_fix": "GC issuance and redemption are separate events linked "
                      "by card ID. Per-store exposure becomes true-"
                      "redemption-attributable.",
        },
        {
            "rule":   "Monthly snapshot — no time dimension. A store crossing "
                      ">30% Recycle Rate mid-month is invisible until the "
                      "waterfall rebuilds. Threshold crossings are "
                      "retrospective labels, not alerts.",
            "v2_fix": "Rolling Recycle Rate + threshold-breach alerts; mid-"
                      "period signal, not month-end.",
        },
        {
            "rule":   "Recycle Rate denominator is ALL returns, not HG-only. "
                      "Inflates the rate at stores whose returns are mostly "
                      "non-HG — the metric conflates HG effectiveness with "
                      "overall return volume.",
            "v2_fix": "Split Recycle Rate into HG-sourced and total; surface "
                      "both so the VP can distinguish program retention from "
                      "return-volume artifact.",
        },
        {
            "rule":   "Missing Rate is denominator-blind at low volumes — a "
                      "store with 1 expected and 1 missing (100%) flags the "
                      "same red as 50 of 50 (100%). Small-denominator noise "
                      "dominates.",
            "v2_fix": "Rate threshold with a minimum-denominator floor (e.g. "
                      "require qty_expected ≥ 10 before the rate is "
                      "evaluated).",
        },
        {
            "rule":   "HG Risk Score weights every signal equally — missing "
                      "rate (operational), PII non-compliance (regulatory), "
                      "and GC volume (activity) each contribute 1 point. "
                      "Legal/regulatory risk and an activity floor shouldn't "
                      "weigh the same.",
            "v2_fix": "Weighted composite with severity tiers — Regulatory "
                      "> Operational > Activity.",
        },
        {
            "rule":   "GC/Gross % uses one absolute threshold across a 120-"
                      "store heterogeneous fleet. 6% at a flagship ≠ 6% at "
                      "an outlet — large stores have more natural GC volume.",
            "v2_fix": "Per-tier threshold (flagship / mall / outlet) or "
                      "peer-group percentile that self-calibrates.",
        },
        {
            "rule":   "Inv Risk Flag is one-directional — catches Missing>5 "
                      "AND Var>0 (items likely on-floor) but misses the "
                      "inverse failure (Missing>5 AND Var<0 = genuine "
                      "shrink). The flag names one pattern; the playbook "
                      "needs both.",
            "v2_fix": "Signed Inv Risk with two playbooks — Missing+OverCount "
                      "= sweethearting pattern; Missing+UnderCount = shrink.",
        },
        {
            "rule":   "Recycle Rate gating hides no-GC stores — the formula "
                      "blanks when Est GC Rev or Returns is zero. VP sees a "
                      "dash with no cue whether the store has no HG program "
                      "or the denominator simply isn't there.",
            "v2_fix": "Explicit 3-state render — 'no program', 'healthy', "
                      "'at-risk' — instead of a silent blank.",
        },
    ],
    # Diagram spec — Waterfall component renders per-store rows sorted by
    # gross desc. Top-of-diagram fleet aggregate summary (Gross → Deduped →
    # Net → Ontology Net totals). Each row is a mini 4-stage bar chart with a
    # flag badge strip (Recycle / GC/Gross / HG Risk). Click row → HG
    # Intelligence anchored on the store. GC recycling callout is the
    # delta visualization between Gross and Deduped (and between Net and
    # Ontology Net) — visually apparent in the bar deltas.
    "diagram": {
        "kind": "waterfall",
        "spec": {
            "stages": ["Gross", "Deduped Gross", "Net", "Ontology Net"],
            "click_through": {
                "target_view": "bi",
                "target_id":   "hg_intel",
                "anchor_field": "store",
            },
        },
    },
    "takeaways": [
        "Net Sales is a correct P&L — GC inflation and return offsets cancel "
        "algebraically. The distortion lives in Gross, not Net. The waterfall "
        "exists to find the gross-inflated stores, not to correct Net.",
        "$378K fleet GC recycling exposure (2.9% of gross) — small in "
        "aggregate, material per-store. 3 of 120 stores above 6% GC/Gross. "
        "The risk is concentrated; the decomp finds where.",
        "Est GC Revenue is an upper-bound estimate, not a ledger value. The "
        "v2 fix replaces the formula entirely with transaction-level payment "
        "tagging — measured, not estimated. Fashion Island's 209%-of-spec "
        "overshoot stops when we read what happened instead of estimating it.",
        "Same waterfall drives the HG Intelligence dashboard and this "
        "mechanic — one threshold set, two surfaces, identical numbers. No "
        "drift possible.",
    ],
    "source_notes": (
        "Insights and threshold table verbatim from deck "
        "scripts/append_mechanic_slides.py s_m2_insights + s_m2_table. "
        "Threshold reasoning extended from notes/mechanic-revenue-decomp-"
        "thresholds.md (peer-relative vs operational families). Weaknesses "
        "drafted from the deck footer caveat, hg_intel module caveats, and "
        "the thresholds note — pending append to notes/mechanics-algo-"
        "weaknesses.md. Compute reuses bi.hg_intel.compute — single source "
        "of truth across HG Intelligence and this mechanic."
    ),
}


def compute(conn) -> dict:
    """Build the per-store revenue waterfall sorted by gross desc.

    Returns:
        {
          rows: [
            {store, gross, est_gc_revenue, deduped, net, ontology_net,
             recycle_rate, gc_gross_pct, hg_risk_score,
             recycle_flag, gc_gross_flag, hg_risk_flag,
             missing_rate, inv_risk_flag},
            ...
          ],
          fleet: {gross, est_gc_revenue, deduped, net, ontology_net,
                  recycle_median, stores},
          hg_risk_distribution: {"0": n, "1": n, "2": n, "3": n},
        }

    Reuses bi.hg_intel.compute(conn) for the source rows + flag matrix —
    every arithmetic rule and every threshold lives in hg_intel.META.
    """
    hg = hg_intel.compute(conn)
    hg_rows = hg["rows"]
    hg_flags = hg["flags"]

    out_rows: list[dict] = []
    for r, flags in zip(hg_rows, hg_flags):
        out_rows.append({
            "store":          r["store"],
            "gross":          r["gross_sales"],
            "est_gc_revenue": r["est_gc_revenue"],
            "deduped":        r["deduped_gross"],
            "net":            r["net_sales"],
            "ontology_net":      r["ontology_net_revenue"],
            "recycle_rate":   r["recycle_rate"],
            "gc_gross_pct":   r["gc_gross_pct"],
            "missing_rate":   r["missing_rate"],
            "hg_risk_score":  r["hg_risk_score"],
            "inv_risk_flag":  r["inv_risk_flag"],
            # Flag colors — mirrored from hg_intel per-cell flag matrix so
            # the Waterfall diagram's status strip never drifts from the BI
            # dashboard's cell colors.
            "recycle_flag":   flags.get("recycle_rate"),
            "gc_gross_flag":  flags.get("gc_gross_pct"),
            "missing_flag":   flags.get("missing_rate"),
            "hg_risk_flag":   flags.get("hg_risk_score"),
            "inv_risk_cell_flag": flags.get("inv_risk_flag"),
        })

    # Sort by gross desc — puts Irvine Spectrum (#1, 7.7% GC/Gross) in row 1
    # so the "top-gross-but-recycling-inflated" insight lands on landing.
    out_rows.sort(key=lambda r: -(r.get("gross") or 0))

    # --- Fleet aggregates (sum across stores, median for Recycle Rate) ---
    def _sum(field: str) -> float:
        return sum((r.get(field) or 0) for r in out_rows)

    recycle_vals = sorted(
        r["recycle_rate"] for r in out_rows if r.get("recycle_rate") is not None
    )
    if recycle_vals:
        mid = len(recycle_vals) // 2
        recycle_median = (
            recycle_vals[mid]
            if len(recycle_vals) % 2 == 1
            else (recycle_vals[mid - 1] + recycle_vals[mid]) / 2
        )
    else:
        recycle_median = None

    fleet = {
        "gross":          _sum("gross"),
        "est_gc_revenue": _sum("est_gc_revenue"),
        "deduped":        _sum("deduped"),
        "net":            _sum("net"),
        "ontology_net":      _sum("ontology_net"),
        "recycle_median": recycle_median,
        "stores":         len(out_rows),
    }

    # --- HG Risk Score distribution (matches deck bullet "0→40, 1→48, ...") ---
    hg_risk_dist: dict[str, int] = {"0": 0, "1": 0, "2": 0, "3": 0}
    for r in out_rows:
        score = r.get("hg_risk_score")
        if score is None:
            continue
        key = str(int(score))
        if key in hg_risk_dist:
            hg_risk_dist[key] += 1

    return {
        "rows":  out_rows,
        "fleet": fleet,
        "hg_risk_distribution": hg_risk_dist,
    }
