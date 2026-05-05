"""Attribution Gap — mechanic #3.

Per-store attribution gap classified into 7 root-cause buckets via a first-
match cascade. Gap $ is a **data-quality signal, not a revenue miss** — the
revenue already happened; what's broken is attribution. The cascade tells the
VP *why* a store has a gap so the fix is specific: POS config, staffing
capacity, refund ops, or HG gift-card dedup.

The 7 buckets map 1:1 to the `primary_flag` values in
`bi.attribution_intel.compute()`:

  1. Reverse Gap    (yellow) — transaction-level per-store attribution
  2. HG-Driven      (red)    — HG gift-card dedup at order level
  3. Coverage Gap   (red)    — staffing gap alert + POS auto-assign
  4. Refund-Driven  (red)    — refund attribution + return-location matching
  5. High Gap       (red)    — POS config audit + compliance training flag
  6. Moderate Gap   (yellow) — attribution monitoring + POS reconciliation
  7. OK             (green)  — (no fix needed)

Compute reuses `bi.attribution_intel.compute(conn)` 1:1 — single source of
truth across Attribution Intelligence (BI dashboard) and this mechanic. Every
cascade rule, flag name, and ontology-fix mapping lives in attribution_intel.

Source-of-truth notes
---------------------
- Deck `s_m3_insights` + `s_m3_table` (scripts/append_mechanic_slides.py) —
  4 insight bullets + 7-row cascade table ported verbatim. Deck uses "Attr
  Capacity" for the Coverage Gap bucket — module + downstream fix mapping
  use "Coverage Gap" (single SoT name). See reconciliation note.
- Weaknesses — 9-item DRAFT in the reconciliation note; stub in
  mechanics-algo-weaknesses.md pending Jack's QA + append.
- Compute reuses attribution_intel.compute — no cascade re-derivation.
"""

from __future__ import annotations

from typing import Any

from ..bi import attribution_intel


# --- Bucket definitions -------------------------------------------------------
#
# Cascade-evaluation order (NOT severity order) — deck + module agree.
# Each entry locks the canonical module `primary_flag` label, the snake_case
# `key` used as the click-through filter value, the severity color (mirrors
# attribution_intel.PRIMARY_FLAG_COLORS), the deck criteria copy, the one-line
# description for the tooltip, and the ontology_fix mapping from
# attribution_intel.FIX_MAP.
#
# Keys MUST be stable — they're the filter values passed via click-through
# into BiTable and the Phase 5 perf_flag_cascade pattern.

_BUCKET_DEFS: list[dict[str, Any]] = [
    {
        "key":         "reverse_gap",
        "label":       "Reverse Gap",
        "severity":    "yellow",
        "criteria":    "Gap% < -2%",
        "description": "Staff outsells store — associate total gross "
                       "over-attributed to one location when associate works "
                       "across multiple stores. May also include online or "
                       "clienteling sales credited to in-store associate but "
                       "absent from POS gross.",
    },
    {
        "key":         "hg_driven",
        "label":       "HG-Driven",
        "severity":    "red",
        "criteria":    "GC%Gap >50% AND Gap$ >$5K",
        "description": "HG gift-card recycling explains the majority of the "
                       "gap. Structural dedup fix — Ontology's order-level GC "
                       "dedup resolves this without any store-side change.",
    },
    {
        "key":         "coverage_gap",
        "label":       "Coverage Gap",
        "severity":    "red",
        "criteria":    "T/S >P75 AND Gap% >15%",
        "description": "High volume per associate — transactions happening "
                       "faster than badge-scan compliance can keep up. The "
                       "largest actionable attribution bucket. (Deck label: "
                       "'Attr Capacity'.)",
    },
    {
        "key":         "refund_driven",
        "label":       "Refund-Driven",
        "severity":    "red",
        "criteria":    "Refund%Gap >25% AND Refund$ >$3K AND Gap% >15%",
        "description": "Refunds are the root cause, not sales-side "
                       "attribution. Return-location matching + refund "
                       "attribution fix resolves these.",
    },
    {
        "key":         "high_gap",
        "label":       "High Gap",
        "severity":    "red",
        "criteria":    "Gap% >30%",
        "description": "Severe gap, no single root cause identified — the "
                       "cascade residual. Explicit 'we see the gap but "
                       "can't isolate it' bucket; needs POS config audit.",
    },
    {
        "key":         "moderate_gap",
        "label":       "Moderate Gap",
        "severity":    "yellow",
        "criteria":    "Gap% >15%",
        "description": "Meaningful gap worth monitoring. Attribution "
                       "reconciliation + ongoing POS monitoring; not an "
                       "emergency but not noise either.",
    },
    {
        "key":         "ok",
        "label":       "OK",
        "severity":    "green",
        "criteria":    "|Gap%| <15%",
        "description": "Below threshold — attribution is healthy "
                       "(within POS-transposition noise floor).",
    },
]

# Canonical-label → key map for compute() → diagram handoff.
_LABEL_TO_KEY: dict[str, str] = {b["label"]: b["key"] for b in _BUCKET_DEFS}


META: dict[str, Any] = {
    "id": "attr_gap",
    "label": "Attribution Gap",
    "deck_hook": (
        "Gap $ is a data-quality signal, not a revenue miss — the revenue "
        "already happened; what's broken is attribution. 7-flag cascade "
        "classifies root cause so the VP knows whether to fix POS config, "
        "staffing, refund ops, or HG dedup. Each flag maps to an Ontology fix."
    ),
    "description": (
        "Per-store store-vs-staff attribution gap classified into 7 "
        "root-cause buckets via a first-match cascade. Each bucket maps to a "
        "specific Ontology ingest fix — Reverse Gap → transaction-level per-store attribution; "
        "HG-Driven → order-level GC dedup; Coverage Gap → POS auto-assign + "
        "staffing alerts; Refund-Driven → refund-location matching; High/"
        "Moderate Gap → POS config audit + monitoring. Click any bucket to "
        "drill into Attribution Intelligence filtered to that flag."
    ),
    "upstream_bi": ["attribution_intel"],
    "utility": (
        "One cascade tells the VP why each store has an attribution gap — "
        "POS config, staffing capacity, refund ops, or HG dedup — and maps "
        "it to a specific Ontology fix. Without the cascade, 83 flagged stores "
        "share one generic recommendation. With it, each store gets a "
        "named root cause and an ingest-layer resolution path."
    ),
    "logic_overview": (
        "For each store: compute Gap % ((store_gross − Σ staff_gross) / "
        "store_gross), Gap $, Traffic/Staff ratio, GC % of Gap, and Refund "
        "% of Gap. Then run 7-flag first-match cascade: (1) Reverse Gap "
        "(gap%<−2%); (2) HG-Driven (gc%>50% AND gap$>$5K); (3) Coverage "
        "Gap (T/S>P75 AND gap%>15%); (4) Refund-Driven (refund%>25% AND "
        "refund$>$3K AND gap%>15%); (5) High Gap (gap%>30%); (6) Moderate "
        "Gap (gap%>15%); (7) OK. Cascade order is load-bearing — specific "
        "structural causes (HG / Coverage / Refund) fire before generic "
        "severity labels (High / Moderate). Same rules drive Attribution "
        "Intelligence and this mechanic — one source of truth."
    ),
    # Live Jan-2026 fleet numbers — templated from deck s_m3_insights
    # (scripts/append_mechanic_slides.py:226-240), extended with bucket
    # counts + Reverse Gap list from compute().
    "key_insights": [
        "Dollar-weighted fleet gap 18.5% ($2.37M unattributed) — 83 of 120 "
        "stores flagged (>15%). Gap is a data-quality signal: revenue "
        "already happened, attribution is what's broken.",
        "Bethesda — 59.0% gap, 2 staff, T/S 755: Coverage Gap (too much "
        "volume per associate to log every transaction). Staffing-capacity "
        "diagnosis, not POS config; different fix.",
        "Volume alone doesn't cause gaps — capacity does. Highest-traffic "
        "stores often have the best attribution. Driver is transactions-"
        "per-associate, not foot traffic. Irvine Spectrum — #1 gross ($512K), "
        "top Ontology Net, high T/S — attribution holds; their flag is HG-Driven "
        "(GC accounting), not Coverage Gap (badge scan). When a Coverage Gap "
        "store says 'we can't scan at this volume,' Irvine says they can. "
        "Reframes 20 Coverage Gap stores as a coaching problem, not an "
        "infrastructure constraint.",
        "Bucket distribution: Reverse 3 · HG-Driven 3 · Coverage 20 · "
        "Refund-Driven 10 · High 18 · Moderate 29 · OK 37. 20 Coverage "
        "Gap stores is the largest actionable bucket — resolved by POS "
        "auto-assign, not behavior change.",
        "Reverse Gap (3 stores: Seaport −14.4%, Baybrook −6.3%, "
        "Atlanta −3.3%) = data attribution anomaly — associate gross "
        "over-allocated to assigned store. Flagged yellow: data quality "
        "issue, not ops problem. Fix: transaction-level per-store attribution.",
    ],
    # 7 rows — verbatim from deck s_m3_table (scripts/append_mechanic_slides.py:
    # 340-363), using the module "Coverage Gap" name instead of the deck's
    # "Attr Capacity" (same rule, same count, single downstream-SoT name).
    # `reasoning` extends deck with the ontology_fix mapping per flag.
    "algorithms": [
        {
            "domain":   "Reverse Gap",
            "metric":   "gap_pct < −2%",
            "green":    "—",
            "yellow":   "YES",
            "red":      "—",
            "reasoning": "Associate total gross over-attributed to one "
                         "location when associate works multiple stores. "
                         "Yellow not red: data quality, not operational. "
                         "Fix: transaction-level per-store attribution.",
        },
        {
            "domain":   "HG-Driven",
            "metric":   "gc_pct_of_gap > 50% AND gap_d > $5K",
            "green":    "—",
            "yellow":   "—",
            "red":      "YES",
            "reasoning": "GC recycling explains majority of gap. $5K floor "
                         "filters noise. Fix: HG gift-card dedup at order "
                         "level — Ontology's structural unlock.",
        },
        {
            "domain":   "Coverage Gap",
            "metric":   "traffic_per_staff > P75 AND gap_pct > 15%",
            "green":    "—",
            "yellow":   "—",
            "red":      "YES",
            "reasoning": "High volume per associate reduces badge-scan "
                         "compliance. P75 cut (not P67) isolates the top-"
                         "quartile-worst cohort. Fix: POS auto-assign + "
                         "staffing capacity alerts. Largest actionable "
                         "bucket (20 stores).",
        },
        {
            "domain":   "Refund-Driven",
            "metric":   "refund_pct_of_gap > 25% AND refund_gap_d > $3K "
                        "AND gap_pct > 15%",
            "green":    "—",
            "yellow":   "—",
            "red":      "YES",
            "reasoning": "Refunds are root cause, not sales-side. Triple "
                         "gate (rate, dollars, overall gap) prevents "
                         "false-positives. Fix: refund-location matching.",
        },
        {
            "domain":   "High Gap",
            "metric":   "gap_pct > 30% (residual)",
            "green":    "—",
            "yellow":   "—",
            "red":      "YES",
            "reasoning": "Severe gap, no specific cause matched. Cascade "
                         "residual — explicit about what the current data "
                         "can't isolate. Fix: POS config audit + manual "
                         "investigation.",
        },
        {
            "domain":   "Moderate Gap",
            "metric":   "gap_pct > 15% (residual)",
            "green":    "—",
            "yellow":   "YES",
            "red":      "—",
            "reasoning": "Meaningful gap deserves a label + monitoring. "
                         "Below High Gap threshold — monitoring, not "
                         "emergency. Fix: attribution monitoring + POS "
                         "reconciliation.",
        },
        {
            "domain":   "OK",
            "metric":   "|gap_pct| < 15% (default)",
            "green":    "YES",
            "yellow":   "—",
            "red":      "—",
            "reasoning": "Below threshold — attribution is healthy. ±15% "
                         "is the POS-transposition noise floor (keying-"
                         "error baseline across retail POS systems).",
        },
    ],
    # 9 weaknesses — DRAFT (pending Jack's QA append to mechanics-algo-
    # weaknesses.md). Mirror Red Count / rev_decomp 1-line rule + 1-line
    # v2 fix pattern.
    "weaknesses": [
        {
            "rule":   "Cascade is first-match-wins — one flag per store, "
                      "hides co-occurring causes. A store can be Coverage "
                      "Gap AND Refund-Driven AND HG-inflated; only the "
                      "first firing condition gets the label. 18 High Gap "
                      "stores are the literal residual bucket.",
            "v2_fix": "Multi-factor diagnostic — evaluate every cascade "
                      "condition in parallel; surface ranked contribution "
                      "list (dollar-weighted) instead of single-winner flag.",
        },
        {
            "rule":   "Staff matching is SUMPRODUCT string lookups across "
                      "three sheets — fragile on nicknames, typos, name "
                      "changes. 6 mismatches in Jan-2026 data; 3 orphaned "
                      "associates drop silently from Staff Gross, "
                      "inflating Gap $ for their stores.",
            "v2_fix": "Canonical staff_id at ingest — every transaction "
                      "links to a staff record by unique ID; string-match "
                      "joins removed.",
        },
        {
            "rule":   "Reverse Gap is flagged but not diagnosable. 3 "
                      "stores fire the rule — the cascade knows the "
                      "anomaly exists but can't say whether it's cross-"
                      "store returns, a join artifact, or a true negative-"
                      "gap phenomenon. Labels the symptom, not the cause.",
            "v2_fix": "Transaction-level return location matching — "
                      "refunds link to the store that processed the "
                      "return, not just the store that rang the sale.",
        },
        {
            "rule":   "Est GC Revenue (HG-Driven's entire input) is "
                      "estimated, not measured — GC issued × Store AOV. "
                      "Fashion Island's 209%-of-spec overshoot is where "
                      "the formula breaks; assumes every GC redeems at "
                      "issue-store avg ticket.",
            "v2_fix": "Transaction-level payment-method tagging — GC "
                      "redemptions become real events with real dollars; "
                      "HG-Driven becomes precise, not probabilistic.",
        },
        {
            "rule":   "Refund Gap is a store-level delta, not a "
                      "transaction-level audit. |Store returns| − "
                      "|Σ Staff refunds| tells you the gap exists, not "
                      "who processed the return. Durham's $10.4K refund "
                      "gap is an opaque number, not an actionable list.",
            "v2_fix": "Refund chain at ingest — every refund links to the "
                      "associate who processed it; Refund Gap $ becomes a "
                      "row-level reconciliation, not a store delta.",
        },
        {
            "rule":   "T/S threshold is fleet-relative P75 AND backward-"
                      "looking — Bethesda's 59% gap surfaces at month-end, "
                      "not week one. Flags are retrospective labels, not "
                      "forward-looking alerts. Mid-month staffing drift "
                      "is invisible.",
            "v2_fix": "Streaming Traffic/Staff with real-time threshold-"
                      "breach alerts; Coverage Gap fires in week one.",
        },
        {
            "rule":   "Coverage Gap measures the load side (T/S >P75) but "
                      "can't verify the behavior side (badge scans "
                      "actually being skipped). Attribution of the flag "
                      "to 'associates skipping scans under pressure' is "
                      "hypothesis, not evidence.",
            "v2_fix": "POS auto-assign — time-proximity matching of "
                      "transactions to terminal + shift schedule; badge-"
                      "scan compliance becomes a separate first-class "
                      "signal.",
        },
        {
            "rule":   "One absolute threshold across a 120-store "
                      "heterogeneous fleet. ±15% / ±30% gap bands ignore "
                      "segment (flagship vs outlet) and format (boutique "
                      "vs mall anchor). 15% at a 2-associate flagship is "
                      "noise; at a 10-associate store it's a real break.",
            "v2_fix": "Per-tier / per-segment thresholds (flagship / mall "
                      "/ outlet), or peer-group percentile that self-"
                      "calibrates to cohort.",
        },
        {
            "rule":   "Cascade order is load-bearing but invisible — "
                      "Reverse → HG → Coverage → Refund → High → "
                      "Moderate → OK encodes Ontology's diagnostic priority. "
                      "VP sees one flag; the rule chain that got there is "
                      "not exposed.",
            "v2_fix": "Surface the full cascade trace per row ('Coverage "
                      "fired because T/S >P75 AND gap >15%; would have "
                      "also fired Refund-Driven'). Transparency on why-"
                      "this-flag.",
        },
    ],
    # Diagram spec — CascadeFlowchart renders a vertical top-to-bottom
    # cascade: source ("120 stores") → 7 sequential bucket nodes, each with
    # count + severity band. Click bucket → Attribution Intelligence filtered
    # to that primary_flag value. The shared CascadeFlowchart is parameterized
    # by the caller — Phase 5 (perf_flag_cascade) reuses it with 5 buckets.
    "diagram": {
        "kind": "cascade_flowchart",
        "spec": {
            "source_label": "120 stores",
            "click_through": {
                "target_view":  "bi",
                "target_id":    "attribution_intel",
                "filter_field": "primary_flag",
            },
        },
    },
    "takeaways": [
        "Attribution Gap is a data-quality signal, not a revenue miss. "
        "$2.37M in unattributed revenue is already booked — the VP doesn't "
        "need to recover the dollars, they need to fix the attribution.",
        "Each flag maps to a specific Ontology ingest fix — Reverse → tx-level "
        "per-store attribution; HG → order-level GC dedup; Coverage → POS "
        "auto-assign; Refund → return-location matching. Without the cascade, "
        "83 stores share one generic recommendation.",
        "Cascade order is load-bearing: structural (Reverse) → systemic "
        "(HG) → operational (Coverage / Refund) → severity-only (High / "
        "Moderate). Each layer peels off a known cause before falling to "
        "generic severity flags. Specific causes fire first so the row "
        "reads as root cause, not severity.",
        "v1 first-match-wins — one flag per store, clean for VP scan. v2 "
        "multi-factor — every contributing cause surfaced with dollar "
        "weight. 18 High Gap stores (the v1 residual) become specifically "
        "actionable under v2.",
    ],
    "source_notes": (
        "Insights and 7-flag cascade table verbatim from deck "
        "scripts/append_mechanic_slides.py s_m3_insights + s_m3_table "
        "(module uses 'Coverage Gap' for the deck's 'Attr Capacity' — "
        "single downstream-SoT name). Weaknesses DRAFT pending append to "
        "notes/mechanics-algo-weaknesses.md. Compute reuses "
        "bi.attribution_intel.compute — single source of truth across "
        "Attribution Intelligence and this mechanic. Ontology fix mapping "
        "from attribution_intel.FIX_MAP."
    ),
}


def compute(conn) -> dict:
    """Build the 7-bucket cascade flowchart data + per-store drill rows.

    Returns:
        {
          rows: [
            {store, primary_flag, primary_flag_key, primary_flag_color,
             gap_pct, gap_d, store_gross, staff_count, traffic_per_staff,
             est_gc_rev, gc_pct_of_gap, refund_gap_d, refund_pct_of_gap,
             ontology_fix},
            ...  (120 rows, sorted gap% desc — highest-gap stores on top)
          ],
          buckets: [
            {key, label, count, severity, example_stores, criteria,
             description, ontology_fix},
            ...  (7 buckets in cascade evaluation order)
          ],
          fleet: {
            total_stores, total_flagged, gap_total_d, gross_total,
            gap_pct_weighted,
          },
        }

    Reuses bi.attribution_intel.compute(conn) 1:1 — every cascade rule and
    every flag string lives in attribution_intel.
    """
    ai = attribution_intel.compute(conn)
    ai_rows = ai["rows"]

    # --- Per-store rows (for drill-down + bucket example selection) -----------
    out_rows: list[dict] = []
    for r in ai_rows:
        flag = r["primary_flag"]
        out_rows.append({
            "store":              r["store"],
            "primary_flag":       flag,
            "primary_flag_key":   _LABEL_TO_KEY.get(flag, "ok"),
            "primary_flag_color": attribution_intel.PRIMARY_FLAG_COLORS.get(flag),
            "gap_pct":            r["gap_pct"],
            "gap_d":               r["gap_d"],
            "store_gross":        r["store_gross"],
            "staff_count":        r["staff_count"],
            "traffic_per_staff":  r["traffic_per_staff"],
            "est_gc_rev":         r["est_gc_rev"],
            "gc_pct_of_gap":      r["gc_pct_of_gap"],
            "refund_gap_d":       r["refund_gap_d"],
            "refund_pct_of_gap":  r["refund_pct_of_gap"],
            "ontology_fix":          r["ontology_fix"],
        })

    # Sort by gap% DESC (Nones last) — Bethesda 59% lands at row 1 so the
    # "highest gap → Coverage Gap" insight lands on first glance.
    out_rows.sort(key=lambda r: (r["gap_pct"] is None, -(r["gap_pct"] or 0)))

    # --- Bucket aggregates (count + example stores) ---------------------------
    rows_by_flag: dict[str, list[dict]] = {b["label"]: [] for b in _BUCKET_DEFS}
    for r in out_rows:
        lst = rows_by_flag.get(r["primary_flag"])
        if lst is not None:
            lst.append(r)

    buckets: list[dict] = []
    for b in _BUCKET_DEFS:
        in_bucket = rows_by_flag.get(b["label"], [])
        # Example stores — top-3 by ABS(gap%) desc (so Reverse Gap surfaces
        # Seaport/Baybrook/Atlanta, not OK stores at 0%). Works for every
        # bucket because abs(gap%) tracks "most extreme" regardless of sign.
        ex_sorted = sorted(
            in_bucket,
            key=lambda r: -abs(r["gap_pct"] or 0),
        )
        example_stores = [r["store"] for r in ex_sorted[:3] if r.get("store")]

        buckets.append({
            "key":            b["key"],
            "label":          b["label"],
            "count":          len(in_bucket),
            "severity":       b["severity"],
            "example_stores": example_stores,
            "criteria":       b["criteria"],
            "description":    b["description"],
            "ontology_fix":      attribution_intel.FIX_MAP.get(b["label"], ""),
        })

    # --- Fleet aggregates -----------------------------------------------------
    total_stores = len(out_rows)
    total_flagged = sum(1 for r in out_rows if r["primary_flag"] != "OK")
    gap_total_d = sum(
        r["gap_d"] for r in out_rows
        if r.get("gap_d") is not None and r["gap_d"] > 0
    )
    gross_total = sum(
        r["store_gross"] for r in out_rows if r.get("store_gross")
    )
    gap_pct_weighted = (gap_total_d / gross_total) if gross_total else None

    fleet = {
        "total_stores":     total_stores,
        "total_flagged":    total_flagged,
        "gap_total_d":      gap_total_d,
        "gross_total":      gross_total,
        "gap_pct_weighted": gap_pct_weighted,
    }

    return {
        "rows":    out_rows,
        "buckets": buckets,
        "fleet":   fleet,
    }
