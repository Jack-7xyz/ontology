"""Red Count — mechanic #1.

The single-number triage. For each store, sum 8 independent compliance domain
flags (Return, Attr Gap, Inventory, HG Missing, Visual, VOC, Cash, Payroll
Budget). Green=0 · Yellow=1-2 · Red≥3.

Entry point to every other mechanic — RC ranks investigation order; per-domain
flags explain *why* a store is in the red. Logic is reused 1:1 from
`bi/ops_compliance.compute_red_count_and_domains()` so Store Intel, Ops
Compliance, and the Red Count mechanic always agree.

Source-of-truth notes
---------------------
- Deck content (insights bullets, threshold table) ported verbatim from
  scripts/append_mechanic_slides.py:191-320 (s_m1_insights + s_m1_table).
- Weaknesses ported from
  .GCC/branches/feature/r3-rebuild-app/notes/mechanics-algo-weaknesses.md
  (12-point critique, locked 2026-04-14).
- Computation reuses ops_compliance.compute_red_count_and_domains — no logic
  duplication.
"""

from __future__ import annotations

from typing import Any

from ..bi import ops_compliance


META: dict[str, Any] = {
    "id": "red_count",
    "label": "Red Count",
    "deck_hook": "Single number per store. Sort by Red Count descending → "
                 "Gross descending and the highest-revenue trouble stores "
                 "rise to the top.",
    "description": "Cross-domain compliance triage. For each store, count how "
                   "many of 8 independent domains are in the red. RC is the "
                   "entry point to every other mechanic — it ranks investigation "
                   "order; domain drill-down explains root cause.",
    "upstream_bi": ["store_intel", "ops_compliance"],
    "utility": "One number tells the VP which stores to look at first. The "
               "8 underlying domain flags tell them why. Filter Red Count ≥3 "
               "for the RC≥3 intervene tier.",
    "logic_overview": (
        "For each store, evaluate 8 compliance domains independently. A "
        "domain is 'red' when its threshold is crossed (Return Rate >P67 of "
        "fleet; Attribution Gap |x|>30%; Inventory Variance |x|>10%; HG "
        "Missing Units >5; Visual Score ≥2.5; VOC Score <60; Cash Compliance "
        "<3 of 5 weeks; Payroll Budget >130% of plan). Red Count = number of "
        "domains red. Same helper drives Store Intel and Ops Compliance — one "
        "threshold set, two surfaces, identical triage output."
    ),
    "key_insights": [
        "Distribution: RC=0 stores (clean) · RC=1-2 · RC≥3 (intervene). "
        "Live values surface in the diagram below.",
        "Entry point to every other mechanic — RC triggers investigation, "
        "the 8 underlying domain flags explain root cause.",
        "Carlsbad — RC=3 across Return, Payroll, HG. 23% return rate alongside "
        "32 missing HG units (2.9% of 1,122 expected) makes it the highest "
        "problem density in fleet.",
        "Baltimore — RC=3 across Visual + Inventory + Attr Gap. Sales can "
        "be fine while operations are broken; cross-domain rollup makes the "
        "pattern visible.",
        "Payroll dominates the RC≥3 tier — [live count] of [live total] RC≥3 "
        "stores have payroll as a red domain. 78% of stores exceeded payroll "
        "budget at least one week in January.",
        "HG Missing Units (>5 = red) is absolute — a store processing 500 HG "
        "orders will accumulate more missing units than a store doing 30, even "
        "at the same compliance rate. Missing Rate provides the normalization: "
        "Carlsbad's 32 units = 2.9% rate; a smaller store with 6 missing = "
        "20%+ rate. v2 should threshold on rate, not units, for a fair "
        "cross-store comparison.",
    ],
    # 8 domain rows — verbatim from deck s_m1_table (append_mechanic_slides.py:296-320).
    "algorithms": [
        {
            "domain":   "Return Rate",
            "metric":   "abs(returns) / gross_sales",
            "green":    "<P33",
            "yellow":   "P33-P67",
            "red":      ">P67",
            "reasoning": "Live percentile — fleet sets its own baseline. No "
                         "portable absolute threshold across retailers.",
        },
        {
            "domain":   "Attribution Gap",
            "metric":   "(store_gross − Σ staff_gross) / store_gross",
            "green":    "<±15%",
            "yellow":   "±15-30%",
            "red":      ">±30%",
            "reasoning": "Fleet ABS median 17.6%; ±30% ≈ median + 1σ (severe "
                         "tail). ABS so over- and under-attribution count equally.",
        },
        {
            "domain":   "Inventory Variance",
            "metric":   "(counted − expected) / expected",
            "green":    "±5%",
            "yellow":   "±5-10%",
            "red":      ">±10%",
            "reasoning": "Negative = shrinkage / theft / loss; positive = "
                         "receiving error or phantom inventory. Tysons -28.3% "
                         "is the fleet's worst signed exposure.",
        },
        {
            "domain":   "HG Missing",
            "metric":   "HG+.missing_units (units expected but absent)",
            "green":    "0",
            "yellow":   "1-5",
            "red":      ">5",
            "reasoning": "Integer-scale operational threshold. >5 = systemic "
                         "cycling pattern (HG Processor detection anchor).",
        },
        {
            "domain":   "Visual",
            "metric":   "Visual+.visual_score (avg of 3 floorset audits)",
            "green":    "<1.5",
            "yellow":   "1.5-2.4",
            "red":      "≥2.5",
            "reasoning": "1-3 scale, 1=best. ≥2.5 = consistently failing top "
                         "decile of drift. Caveat: zero correlation with fine "
                         "revenue — compliance signal only, not predictor.",
        },
        {
            "domain":   "VOC",
            "metric":   "VOC+.voc_overall_score (mystery-shop composite)",
            "green":    "≥80",
            "yellow":   "60-79",
            "red":      "<60",
            "reasoning": "0-100 scale. 80 ≈ standard mystery-shop pass cutoff. "
                         "<60 = bottom-decile store experience.",
        },
        {
            "domain":   "Cash",
            "metric":   "Cash+.total_compliant_weeks (of 5)",
            "green":    "5/5",
            "yellow":   "3-4/5",
            "red":      "<3/5",
            "reasoning": "5/5 = full weekly-deposit SLA. <3 trips audit "
                         "trigger. Strict =5 matches the source-sheet formula.",
        },
        {
            "domain":   "Payroll Budget",
            "metric":   "Payroll+.avg_budget_pct (mean of 5 weekly budget %)",
            "green":    "≤100%",
            "yellow":   "101-130%",
            "red":      ">130%",
            "reasoning": "100% = on plan. DB median 102.5%, stdev 36.7% → "
                         "130% ≈ material overspend. Avg smooths single-week "
                         "spikes; max-week is visibility-only (not in RC).",
        },
    ],
    # 12 weaknesses ported from notes/mechanics-algo-weaknesses.md:18-64.
    # Each item: 1-line rule (what v1 misses) + 1-line v2 fix.
    "weaknesses": [
        {
            "rule":   "Unweighted sum — RC=3 at a $2M flagship looks identical "
                      "to RC=3 at a $15K outlet. No dollar weighting, no "
                      "severity weighting.",
            "v2_fix": "Weighted score = severity × revenue exposure × segment "
                      "multiplier.",
        },
        {
            "rule":   "Absolute dollars hidden inside percentages — 131% and "
                      "270% payroll both count as one Payroll flag; every "
                      "% metric leaks dollar magnitude.",
            "v2_fix": "Surface 'dollars at risk' as a secondary sort, not "
                      "flag count alone.",
        },
        {
            "rule":   "Attribution Gap is a residual, not a diagnosis — High "
                      "Gap fires only when no specific cause matches (HG / "
                      "Coverage / Refund). Co-occurring causes are hidden.",
            "v2_fix": "Multi-label cascade with root-cause ranking, not "
                      "first-match-wins.",
        },
        {
            "rule":   "Fleet-relative thresholds self-anesthetize — Return "
                      "Rate >P67 always flags the top third. If the whole "
                      "fleet drifts, nobody turns red.",
            "v2_fix": "Dual rule — percentile OR absolute floor, whichever "
                      "fires first.",
        },
        {
            "rule":   "Absolute % thresholds ignore segment — 30% attr gap at "
                      "a flagship ≠ 30% at an outlet. One bar for a 120-store "
                      "heterogeneous fleet is wrong by construction.",
            "v2_fix": "Per-tier thresholds (flagship / mall / outlet) or "
                      "per-category.",
        },
        {
            "rule":   "Flat counts instead of rates — HG Missing >5 treats "
                      "'6 of 8 issued' (75%) the same as '6 of 80' (7.5%). "
                      "Denominator-blind.",
            "v2_fix": "Rate-based threshold with a minimum-denominator floor.",
        },
        {
            "rule":   "abs() on Inventory conflates shrink and over-count — "
                      "−12% (theft) and +12% (phantom inventory) need "
                      "different owners and different playbooks.",
            "v2_fix": "Signed thresholds with distinct playbooks per "
                      "direction.",
        },
        {
            "rule":   "Single snapshot — no time dimension. A store red one "
                      "week and a store red eight weeks straight have the "
                      "same RC. No persistence, no trend.",
            "v2_fix": "Streak count, rolling-window state, trend arrow.",
        },
        {
            "rule":   "Cascade order is load-bearing and invisible — "
                      "Reverse Gap → HG → Coverage → Refund → High → "
                      "Moderate. Co-occurring causes never surface.",
            "v2_fix": "Expose the full cascade result, not just the winning "
                      "flag.",
        },
        {
            "rule":   "Signed-direction blindness — Returns flags only high "
                      "rates (a store at 0% returns is invisible). Most "
                      "thresholds are one-sided when the business problem is "
                      "two-sided.",
            "v2_fix": "Two-sided rules where the low end is also a signal.",
        },
        {
            "rule":   "Domains are independent — Payroll red AND Visual red "
                      "AND VOC red is a causal chain (understaffed → bad "
                      "floor → bad experience). RC treats them as 3 unrelated "
                      "flags.",
            "v2_fix": "Cross-domain root-cause clustering. Core Ontology "
                      "differentiator vs the sheet.",
        },
        {
            "rule":   "Equal-weight domains — Cash Compliance "
                      "(regulatory / legal risk) and Visual Score (audit "
                      "tidiness) contribute equally to RC.",
            "v2_fix": "Domain severity tiers — Legal > Financial > "
                      "Operational > Audit.",
        },
    ],
    # Diagram spec — Grid8Domain renders an 8-column × N-row matrix sorted by
    # RC desc. Each cell is a G/Y/R chip per (store, domain). Hover row →
    # tooltip with RC and store name; click row → navigate to Store Intel
    # anchored on the store name.
    "diagram": {
        "kind": "grid_8_domain",
        "spec": {
            "columns": ops_compliance.DOMAIN_LABELS,  # 8 domain headers, locked order
            "click_through": {
                "target_view": "bi",
                "target_id":   "store_intel",
                "anchor_field": "store",
            },
        },
    },
    "takeaways": [
        "Red Count is a triage prototype, not a scoring engine. v1 counts "
        "flags; v2 weights them by dollar exposure, segment, persistence, "
        "and domain severity — and routes co-occurring flags to root cause "
        "instead of first-match-wins.",
        "Same 8-domain helper drives Store Intel and Ops Compliance — one "
        "threshold set, two surfaces, identical triage output. No drift "
        "possible.",
        "VP-configurable starting points: every threshold is a default, not "
        "a law. 'VP sets the bar, Ontology enforces' is the v2 framing.",
    ],
    "source_notes": (
        "Insights and threshold table verbatim from deck "
        "scripts/append_mechanic_slides.py s_m1_insights + s_m1_table. "
        "Weaknesses from notes/mechanics-algo-weaknesses.md (12-point "
        "critique, locked 2026-04-14). Compute reuses "
        "ops_compliance.compute_red_count_and_domains — single source of "
        "truth across Store Intel, Ops Compliance, and Red Count."
    ),
}


def compute(conn) -> dict:
    """Build the per-store 8-domain matrix sorted by Red Count desc.

    Returns:
        {
          rows: [
            {store, red_count, red_domains, gross_sales,
             cells: {"Return": "red"|"yellow"|"green"|None, ...}},
            ...
          ],
          distribution: {"0": int, "1": int, "2": int, "3+": int},
        }

    Reuses Ops Compliance compute() for the source rows — every threshold
    rule lives in ops_compliance.META (single source of truth).
    """
    oc = ops_compliance.compute(conn)
    oc_rows = oc["rows"]
    oc_flags = oc["flags"]

    # Domain → ops_compliance column name. Order matches DOMAIN_LABELS.
    domain_to_col = {
        "Return":    "return_rate",
        "Attr Gap":  "true_attr_gap_pct",
        "Payroll":   "payroll_budget_pct",
        "Visual":    "visual_score",
        "VOC":       "voc_score",
        "Cash":      "cash_compliance",
        "HG":        "hg_missing_units",
        "Inventory": "inventory_variance",
    }

    # Recompute Red Count + Red Domains (parallel array, same order as oc_rows)
    # so we surface the same Carlsbad RC=3 / Baltimore RC=3 the deck cites.
    rc_dom = ops_compliance.compute_red_count_and_domains(oc_rows)

    out_rows: list[dict] = []
    for r, flags, (rc, dom_str) in zip(oc_rows, oc_flags, rc_dom):
        cells: dict[str, str | None] = {}
        for label in ops_compliance.DOMAIN_LABELS:
            col = domain_to_col[label]
            cells[label] = flags.get(col)
        out_rows.append({
            "store":       r["store"],
            "red_count":   rc,
            "red_domains": dom_str,
            "gross_sales": r["gross_sales"],
            "cells":       cells,
        })

    # Already sorted by Ops Compliance compute() — RC desc then gross desc.
    # Defensive re-sort in case upstream ordering ever changes.
    out_rows.sort(key=lambda r: (-(r["red_count"] or 0), -(r["gross_sales"] or 0)))

    # Distribution for the deck-style "Distribution: RC=0: x, RC=1: y..." line.
    dist = {"0": 0, "1": 0, "2": 0, "3+": 0}
    for r in out_rows:
        rc = r["red_count"] or 0
        if rc <= 2:
            dist[str(rc)] += 1
        else:
            dist["3+"] += 1

    return {"rows": out_rows, "distribution": dist}
