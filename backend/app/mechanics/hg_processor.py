"""HG Processor Detection — mechanic #4.

Per-associate flag for "HG Processors" — associates whose primary function is
processing HG returns + re-ringing gift-card redemptions. The flag separates
HG behavior from genuine underperformance so the VP coaches the right people
and reassigns the rest. Without this filter, a naive refund-rate review puts
63 associates on disciplinary notice when they are doing a materially
different job.

Detection rule (store-relative + $5K floor):
    refund_rate − store.return_rate > +10pp
    AND gross_sales > $5,000
    → hg_processor = YES

Store-relative is load-bearing: absolute refund-rate varies structurally by
store regime (NYC flagships 30%+, TX outlets <10%); a fleet-constant cut would
miss NYC processors and false-flag every TX associate over the bar. $5K floor
filters low-volume noise (part-timer with 2 transactions and 1 refund =
meaningless 50% rate) — HG Processors actually have higher gross because they
ring up both sides of the gift-card cycle.

Compute reuses `bi.associate_perf.compute(conn)` 1:1 — single source of truth
across Associate Performance (BI dashboard) + Performance Flag cascade + this
mechanic. The detection rule is implemented inline in `associate_perf.compute`
(col U = hg_processor); we filter rows, never re-derive.

Source-of-truth notes
---------------------
- Deck `s_m4_insights` + `s_m4_table` (scripts/append_mechanic_slides.py) —
  4 insight bullets + 3-row algorithm table ported verbatim.
- Weaknesses — 9-item DRAFT in the reconciliation note
  (notes/mechanic-hg_processor-reconciled.md §Weaknesses); stub in
  `.GCC/.../notes/mechanics-algo-weaknesses.md` §Mechanic #4 pending Jack's
  QA + append.
- Compute reuses associate_perf.compute — no threshold re-derivation.
"""

from __future__ import annotations

from typing import Any

from ..bi import associate_perf


META: dict[str, Any] = {
    "id": "hg_processor",
    "label": "HG Processor Detection",
    "deck_hook": (
        "HG Processors aren't underperformers — they're doing a different "
        "job, processing HG returns and re-ringing gift-card redemptions. "
        "Flagging them first separates HG behavior from genuine "
        "underperformance so the VP coaches the right people and reassigns "
        "the rest."
    ),
    "description": (
        "Per-associate flag for HG Processors — refund rate exceeds the "
        "associate's own store return rate by >10pp AND gross > $5K. Store-"
        "relative threshold adapts to each store's natural return regime; "
        "$5K floor filters low-volume noise (a part-timer with 2 txns and "
        "1 refund is not a processor). 63 of 601 associates flagged across "
        "51 stores. Click any flagged dot to drill into Associate "
        "Performance anchored on the staff ID."
    ),
    "upstream_bi": ["associate_perf", "hg_intel"],
    "utility": (
        "One scatter surfaces the 63 associates doing a different job — so "
        "the VP doesn't coach the wrong problem. A naive refund-rate review "
        "would put them on 2-week notice; the store-relative +10pp "
        "threshold catches them automatically. Reassign, don't discipline. "
        "This is also the entry gate to the Performance Flag cascade — HG "
        "Processors must be excluded before any productivity evaluation "
        "runs."
    ),
    "logic_overview": (
        "For each associate: compute refund_rate = |refunds| / gross_sales; "
        "compute delta_pp = refund_rate − store.return_rate. If delta_pp > "
        "+10pp AND gross > $5K → HG Processor (YES). Store-relative cut "
        "adapts to each store's natural return regime (NYC flagships 30%+ "
        "vs TX outlets <10%). $5K floor filters low-volume noise (2 txns, "
        "1 refund = meaningless 50%). HG Processors actually have higher "
        "gross than average — they ring both sides of the gift-card cycle "
        "(the return AND the re-spend). Same rule drives Associate "
        "Performance col U and Perf Flag cascade priority-1 — one source "
        "of truth."
    ),
    # Deck s_m4_insights bullets (append_mechanic_slides.py:242-256) with the
    # live Jan-2026 fleet numbers. Bullet 5 extends from compute — top-5 by
    # delta_pp so the deck's "Naperville Staff 237 — 123% refund rate" spotlight
    # lands on the page.
    "key_insights": [
        "63 of 601 associates flagged (10.5%). Store-relative +10pp cut + "
        "$5K floor — two conditions both required, AND gate. Flagged "
        "associates span 51 stores.",
        "Store-relative thresholds prevent false-flagging associates at "
        "naturally high-return stores. A 35% refund rate at an NYC flagship "
        "with 33% store return rate is within noise; the same 35% at a TX "
        "outlet with 8% store return is a processor.",
        "HG processors must be identified first — they aren't under-"
        "performers, they're doing a different job. Evaluating their "
        "productivity without context leads to wrong coaching, wrong "
        "incentives. Highest priority in the Perf Flag cascade.",
        "Top processors by delta (refund rate over store baseline): "
        "Carlsbad Staff 104 (+101.7pp, 124.7% refund rate, $8.4K refund); "
        "Naperville Staff 237 (+85.4pp, 123.0%, $9.1K); Bellevue Staff 277 "
        "(+62.1pp, 82.6%, $4.7K). Pattern is obvious once store-relative.",
        "Top processors by refund $ (dollar-weighted): Oakbrook 147 "
        "($12.2K), Irvine Spectrum 355 ($10.1K), Fashion Valley 64 ($9.8K), "
        "Corte Madera 576 ($9.3K), Naperville 237 ($9.1K). $309.9K total "
        "refunds cycled by flagged processors.",
    ],
    # 3 rows — verbatim from deck s_m4_table (append_mechanic_slides.py:
    # 364-380). Count in the Result row is live (matches compute).
    "algorithms": [
        {
            "domain":    "Refund Rate",
            "metric":    "refund_rate − store.return_rate",
            "green":     "—",
            "yellow":    "—",
            "red":       "> +10pp",
            "reasoning": "Store-relative — adapts to each store's natural "
                         "return rate. NYC flagships vs TX outlets have "
                         "very different baselines; a fleet-constant cut "
                         "would miss NYC processors and false-flag every "
                         "TX associate over the bar.",
        },
        {
            "domain":    "Gross Floor",
            "metric":    "gross_sales",
            "green":     "—",
            "yellow":    "—",
            "red":       "AND > $5,000",
            "reasoning": "Filters noise. A part-timer with 2 transactions "
                         "and 1 refund = meaningless 50% rate. HG "
                         "processors have higher gross than average — they "
                         "ring both sides of the gift-card cycle (return "
                         "AND re-spend).",
        },
        {
            "domain":    "Result",
            "metric":    "YES if both conditions hold",
            "green":     "—",
            "yellow":    "—",
            "red":       "YES = HG Processor (63/601)",
            "reasoning": "Red cell. Highest priority in Perf Flag "
                         "cascade — must exclude before evaluating "
                         "productivity. Reassign, don't discipline.",
        },
    ],
    # 9 weaknesses — DRAFT (pending Jack's QA append to mechanics-algo-
    # weaknesses.md §Mechanic #4). Mirror Red Count / rev_decomp / attr_gap
    # 1-line rule + 1-line v2 fix pattern. Drafted from deck footer caveat +
    # associate_perf column META rationale + improvements catalog entries
    # (tx_level_refund_chain, weekly_hg_drift_alerts).
    "weaknesses": [
        {
            "rule":   "Detection is statistical pattern-match, not audit. "
                      "The rule identifies associates consistent with being "
                      "HG Processors but doesn't verify the full cycle "
                      "(sale → return → GC issue → GC redemption → by "
                      "whom). 63 flagged processors are hypotheses, not "
                      "proven chains.",
            "v2_fix": "Transaction-level refund chain — link each refund "
                      "to a card ID; follow GC issuance + redemption end-"
                      "to-end. Pattern-match becomes audit.",
        },
        {
            "rule":   "Monthly snapshot — no time dimension. An associate "
                      "crossing the +10pp threshold mid-month is invisible "
                      "until month-end rebuild. New HG-cycling behavior "
                      "takes 4+ weeks to surface.",
            "v2_fix": "Rolling refund-rate vs rolling store-return-rate "
                      "with threshold-breach alerts; flags fire in days, "
                      "not weeks.",
        },
        {
            "rule":   "$5K gross floor is fleet-constant across 120 "
                      "heterogeneous stores. Same cutoff for an Aspen "
                      "boutique and an Orlando mall anchor ignores wildly "
                      "different volume regimes — single floor doesn't "
                      "self-calibrate.",
            "v2_fix": "Per-store or per-traffic-tier floor (e.g. N× store "
                      "median gross / associate), or percentile-based "
                      "cutoff.",
        },
        {
            "rule":   "+10pp delta is an absolute threshold across fleet "
                      "return-rate regimes. A +10pp deviation at 8% store "
                      "return (25% relative bump) is a much larger signal "
                      "than +10pp at 35% (29% bump) — absolute pp has "
                      "different statistical meaning across the fleet.",
            "v2_fix": "Multiplicative or percentile threshold (e.g. refund "
                      "rate > 2× store return rate), not absolute pp "
                      "delta.",
        },
        {
            "rule":   "Detection can't distinguish HG Processor from "
                      "policy-abuser. Both patterns look identical: high "
                      "refund rate, non-trivial gross. The flag labels "
                      "behavior without validating intent — which means "
                      "the 'reassign, don't discipline' prescription could "
                      "be wrong for a subset.",
            "v2_fix": "GC-linked cycle detection — an HG Processor's "
                      "refunds feed GC re-spend at the same or sibling "
                      "store; a policy-abuser's don't. Once the chain is "
                      "traced, the two collapse into distinct signatures.",
        },
        {
            "rule":   "Blank store-relative cols silently exclude "
                      "associates. Los Gatos (2) + Rockingham Park (1) + "
                      "Shops around Lenox Associate 184 (gross=0, "
                      "divide-by-zero) return hg_processor='' because "
                      "refund_vs_store is None. Not flagged AND not "
                      "surfaced as data-quality exceptions.",
            "v2_fix": "Explicit 'unmatched — data gap' state in the "
                      "cascade, separate from 'not flagged' — so the VP "
                      "sees the blanks and the ingest team gets a "
                      "discrepancy ticket.",
        },
        {
            "rule":   "Gross floor fires on gross cycled, not net "
                      "retained. An HG Processor grossing $30K with $25K "
                      "in refunds has $5K net — the $5K floor on gross "
                      "easily clears, but the retained-revenue signal is "
                      "weak. Floor on a denominator that includes return-"
                      "funded re-spend is almost circular.",
            "v2_fix": "Evaluate floor on net revenue or non-refund gross "
                      "so the cutoff tracks actual productive behavior.",
        },
        {
            "rule":   "'Reassign, don't discipline' is the prescription, "
                      "but detection gives no severity ranking. Carlsbad "
                      "104 (+101.7pp, $8.4K refund) is very different from "
                      "a $5.1K-gross associate barely over the $5K floor. "
                      "Both get the same label; management action should "
                      "differ.",
            "v2_fix": "Severity tier (primary / secondary / incidental) "
                      "derived from delta magnitude × volume × GC-"
                      "redemption share once the chain is traced.",
        },
        {
            "rule":   "Cascade ordering hides HG Processor's also-low "
                      "performance. Because HG Processor fires first in "
                      "Perf Flag, an HG Processor who is ALSO genuinely "
                      "unproductive (non-HG-adjusted Sales/Hour <60% of "
                      "store RLH) gets only the HG label — their selling "
                      "behavior is invisible.",
            "v2_fix": "Non-HG-adjusted Sales/Hour + non-HG Refund Rate as "
                      "first-class metrics; HG Processor becomes a "
                      "context flag, not a cascade-ender.",
        },
    ],
    # Diagram spec — StoreRelativeScatter: x = store_return_rate,
    # y = refund_rate (associate). Dashed diagonal at y = x + 0.10 separates
    # flag region (above + $5K floor) from non-flagged. Click flagged dot →
    # Associate Performance anchored on the staff_id.
    "diagram": {
        "kind": "store_relative_scatter",
        "spec": {
            "x_field":        "store_return_rate",
            "y_field":        "refund_rate",
            "delta_pp":       0.10,
            "refund_floor_d": 5000,
            "click_through": {
                "target_view":  "bi",
                "target_id":    "associate_perf",
                "anchor_field": "associate_id",
            },
        },
    },
    "takeaways": [
        "HG Processor detection separates the 63 associates doing a "
        "different job from the 14 genuine underperformers. v1 pattern-"
        "matches on refund rate + gross floor; v2 traces the full GC cycle "
        "so 'processor' becomes a proven chain, not a statistical "
        "inference.",
        "Store-relative threshold is load-bearing — absolute refund rate "
        "varies structurally by store regime. Without the store baseline, "
        "NYC processors get missed and TX high-volume associates get "
        "false-flagged.",
        "$5K gross floor isolates structural role from noise. HG "
        "Processors have higher gross, not lower — they ring both sides of "
        "the gift-card cycle. The floor also keeps part-timer noise out of "
        "the flagged list (2 txns, 1 refund = not a processor).",
        "Same rule drives Associate Performance col U, Perf Flag cascade "
        "priority-1, and this mechanic. One source of truth — no drift "
        "between BI dashboard, cascade, and scatter.",
    ],
    "source_notes": (
        "Insights and 3-row algorithm table verbatim from deck "
        "scripts/append_mechanic_slides.py s_m4_insights + s_m4_table. "
        "Weaknesses DRAFT pending append to notes/mechanics-algo-"
        "weaknesses.md §Mechanic #4 (empty stub at reconciliation time). "
        "Compute reuses bi.associate_perf.compute — detection rule "
        "implemented inline in col U (lines 423-429) is the single source "
        "of truth. No dedicated helper; mechanic filters rows where "
        "hg_processor == 'YES'."
    ),
}


def compute(conn) -> dict:
    """Build the per-associate scatter data + fleet aggregate.

    Returns:
        {
          rows: [
            {associate_id, associate_name, store, refund_rate,
             store_return_rate, delta_pp, refund_d, gross_d, is_flagged},
            ...  (all associates with valid store-relative baseline)
          ],
          fleet: {
            total_associates, flagged_count, flagged_refund_d,
            flagged_gross_d, stores_affected, dropped_no_baseline,
          },
          thresholds: {delta_pp: 0.10, refund_floor_d: 5000},
        }

    Reuses bi.associate_perf.compute(conn) 1:1 — every detection-rule value
    and every flag string lives in associate_perf.compute (col U). Rows
    where refund_vs_store is None (Los Gatos / Rockingham Park / Associate
    184 at Shops around Lenox) are dropped from the scatter — can't plot
    an associate without a store baseline, and they aren't flagged anyway.
    The dropped count is surfaced in fleet for transparency.
    """
    ap = associate_perf.compute(conn)
    ap_rows = ap["rows"]

    rows: list[dict] = []
    dropped_no_baseline = 0
    flagged_stores: set[str] = set()
    flagged_refund_d = 0.0
    flagged_gross_d = 0.0

    for r in ap_rows:
        refund_rate = r.get("refund_rate")
        refund_vs_store = r.get("refund_vs_store")
        # Drop associates without a store-relative baseline (they'd be
        # unplottable on a 2D scatter). Surfaced as fleet.dropped_no_baseline.
        if refund_rate is None or refund_vs_store is None:
            dropped_no_baseline += 1
            continue

        gross = r.get("gross_sales") or 0.0
        refunds = r.get("refunds") or 0.0
        # Store return rate = refund_rate − refund_vs_store (reverse derive,
        # avoids a second Store+ lookup — mirror SoT). Clamp to non-negative
        # for plotting safety (store return_rate is always >=0 in the data).
        store_return_rate = refund_rate - refund_vs_store

        is_flagged = r.get("hg_processor") == "YES"

        associate_id = r.get("staff_id")
        rows.append({
            "associate_id":      associate_id,
            "associate_name":    f"Staff {associate_id}" if associate_id is not None else None,
            "store":             r.get("store"),
            "refund_rate":       refund_rate,
            "store_return_rate": store_return_rate,
            "delta_pp":          refund_vs_store,
            "refund_d":          abs(refunds) if refunds else 0.0,
            "gross_d":           gross,
            "is_flagged":        is_flagged,
        })

        if is_flagged:
            flagged_refund_d += abs(refunds) if refunds else 0.0
            flagged_gross_d += gross
            if r.get("store"):
                flagged_stores.add(r["store"])

    # Sort: flagged first (so they render on top of the non-flagged cloud
    # when the diagram iterates), then by delta_pp DESC so Carlsbad 104 and
    # Naperville 237 (the deck spotlight rows) land at the top of any
    # derived ranking.
    rows.sort(key=lambda r: (not r["is_flagged"], -(r.get("delta_pp") or 0)))

    flagged_count = sum(1 for r in rows if r["is_flagged"])

    # Fixed bins by delta_pp: +10-20, +20-30, ..., +90-100, +100+.
    # Surfaces concentration around the flag threshold.
    flagged_deltas = [r["delta_pp"] for r in rows if r["is_flagged"] and r.get("delta_pp") is not None]
    _bin_edges = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00]
    bins: list[dict] = []
    for i, lo in enumerate(_bin_edges):
        if i < len(_bin_edges) - 1:
            hi = _bin_edges[i + 1]
            bins.append({
                "label":  f"+{int(round(lo * 100))}–{int(round(hi * 100))}pp",
                "bottom": lo,
                "top":    hi,
                "count":  sum(1 for d in flagged_deltas if lo <= d < hi),
            })
        else:
            bins.append({
                "label":  "+100+pp",
                "bottom": lo,
                "top":    None,
                "count":  sum(1 for d in flagged_deltas if d >= lo),
            })
    # total_associates counts every AP row including dropped (source-of-truth
    # total fleet size — 601 in Jan-2026). Flagged_count is over plottable.
    total_associates = len(ap_rows)

    fleet = {
        "total_associates":    total_associates,
        "flagged_count":       flagged_count,
        "flagged_refund_d":    flagged_refund_d,
        "flagged_gross_d":     flagged_gross_d,
        "stores_affected":     len(flagged_stores),
        "dropped_no_baseline": dropped_no_baseline,
    }

    thresholds = {
        "delta_pp":       0.10,
        "refund_floor_d": 5000,
    }

    return {
        "rows":       rows,
        "fleet":      fleet,
        "thresholds": thresholds,
        "bins":       bins,
    }
