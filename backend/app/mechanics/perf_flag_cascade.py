"""Performance Flag Cascade — mechanic #5.

Per-associate single-label cascade classifying every associate into one of 5
buckets via first-match-wins rules on store-relative productivity + refund
metrics. HG Processors fire first (must exclude before evaluating
productivity); Low Productivity + High Refunds isolate the real coaching
targets; Top Performers surface for recognition; everyone else is Standard.

The 5 buckets map 1:1 to the `perf_flag` values in
`bi.associate_perf.compute()` (col W):

  1. HG Processor      (red)    — refund_vs_store >+10pp AND gross >$5K
  2. Low Productivity  (red)    — s_hr_vs_store <0.60 AND hours >100
  3. High Refunds      (yellow) — refund_vs_store >+10pp AND gross ≤$5K
  4. Top Performer     (green)  — s_hr_vs_store ≥1.50
  5. Standard          (green)  — default (everyone else — within store norms)

Compute reuses `bi.associate_perf.compute(conn)` 1:1 — single source of truth
across Associate Performance (BI dashboard) + HG Processor Detection + this
cascade. Every rule and every flag string lives in associate_perf col W.

Source-of-truth notes
---------------------
- Deck `s_m5_insights` + `s_m5_table` (scripts/append_mechanic_slides.py:
  258-271, 382-407) — 3 insight bullets + 5-row priority cascade table ported
  verbatim. Counts come from live compute (not hard-coded in deck).
- Compute reuses associate_perf.compute — no rule re-derivation.
- Weaknesses — 10-item DRAFT; stub in mechanics-algo-weaknesses.md §Mechanic #5
  pending Jack's QA + append.
- Improvements catalog: 4 entries live (bi/improvements.py:310-421) —
  hg_processor_perf_isolation · part_time_productivity ·
  two_week_notice_trending · recognition_program.
"""

from __future__ import annotations

from typing import Any

from ..bi import associate_perf


# --- Bucket definitions -------------------------------------------------------
#
# Cascade-evaluation order (matches associate_perf col W). Each entry locks the
# canonical module `perf_flag` label, snake_case `key` used as the click-through
# filter value, severity color, deck criteria copy, one-line description, and
# management action.
#
# Keys MUST be stable — they're the filter values passed via click-through into
# BiTable. Label MUST match the string produced by associate_perf.compute's
# cascade (lines 434-443 of associate_perf.py).

_BUCKET_DEFS: list[dict[str, Any]] = [
    {
        "key":         "hg_processor",
        "label":       "HG Processor",
        "severity":    "red",
        "criteria":    "Refund >store+10pp AND Gross >$5K",
        "description": "Associate's refund rate exceeds own store's return rate "
                       "by >10pp AND gross sales >$5K. Doing a different job — "
                       "processing HG returns + re-ringing gift-card "
                       "redemptions. Reassign, don't discipline.",
        "action":      "Reassign to HG-dedicated role. Do NOT evaluate on "
                       "productivity metrics — they ring both sides of the GC "
                       "cycle.",
    },
    {
        "key":         "low_productivity",
        "label":       "Low Productivity",
        "severity":    "red",
        "criteria":    "S/Hr <60% store RLH AND Hours >100",
        "description": "Sales-per-hour <60% of the associate's OWN store's "
                       "Rev/Labor Hour baseline, with ≥100 hours worked so "
                       "part-timers aren't false-flagged. Store-relative cut "
                       "preserves meaning across NYC flagship and TX outlet "
                       "alike.",
        "action":      "Coach. Genuine underperformer once HG Processors + "
                       "part-timers are excluded. The real coaching list.",
    },
    {
        "key":         "high_refunds",
        "label":       "High Refunds",
        "severity":    "yellow",
        "criteria":    "Refund >store+10pp AND Gross ≤$5K",
        "description": "Same refund-rate signal as HG Processor, but gross is "
                       "low — not a gift-card cycler. Part-timer with "
                       "return-heavy pattern, or a policy-abuse candidate. "
                       "Investigate transaction details before acting.",
        "action":      "Investigate. Could be data noise (tiny denominator), "
                       "policy issue, or returns-desk-only shift pattern.",
    },
    {
        "key":         "top_performer",
        "label":       "Top Performer",
        "severity":    "green",
        "criteria":    "S/Hr ≥150% store RLH",
        "description": "Sales-per-hour ≥150% of the associate's own store's "
                       "Rev/LH. Genuine standout, not just above average — "
                       "50pp clear of fleet-median productivity. Replicable "
                       "playbook per store.",
        "action":      "Recognize. Surface for VP-facing recognition alerts. "
                       "Same pipeline as the 2-Week Notice Trigger, opposite "
                       "ontologyity.",
    },
    {
        "key":         "standard",
        "label":       "Standard",
        "severity":    "green",
        "criteria":    "Everyone else",
        "description": "Within store norms on both productivity and refund "
                       "rate. No action needed. Residual catch-all of the "
                       "cascade — the quiet majority.",
        "action":      "No action. Baseline fleet — not a coaching target, "
                       "not a recognition candidate.",
    },
]

_LABEL_TO_KEY: dict[str, str] = {b["label"]: b["key"] for b in _BUCKET_DEFS}


META: dict[str, Any] = {
    "id": "perf_flag_cascade",
    "label": "Performance Flag Cascade",
    "deck_hook": (
        "Every associate gets one label per month — HG Processor, Low "
        "Productivity, High Refunds, Top Performer, or Standard. Each label "
        "maps to a specific management action. Store-relative throughout — a "
        "$200/hr associate is Low Productivity at a $400/hr store and Top "
        "Performer at a $150/hr store."
    ),
    "description": (
        "Per-associate first-match-wins cascade producing a single action "
        "label per month. HG Processors fire first (must exclude before "
        "evaluating productivity); Low Productivity (<60% store RLH, 100-hr "
        "minimum) isolates genuine underperformers; High Refunds catches the "
        "same refund-rate pattern as HG but at low volume (investigate, not "
        "reassign); Top Performers (≥150% store RLH) surface for recognition; "
        "everyone else is Standard. Click any bucket to drill into Associate "
        "Performance filtered to that flag."
    ),
    "upstream_bi": ["associate_perf"],
    "utility": (
        "One cascade reduces 601 associates to a tight action list: 63 HG "
        "Processors (reassign), 14 Low Productivity (coach), 18 High Refunds "
        "(investigate), 9 Top Performers (recognize), 497 Standard (no "
        "action). Without the cascade, a refund-rate review would put 63 HG "
        "Processors on disciplinary notice — wrong coaching on ~11% of the "
        "associate base. The cascade order is the single most load-bearing "
        "diagnostic choice in the app: every rule depends on HG Processor "
        "firing first."
    ),
    "logic_overview": (
        "For each associate: evaluate 4 rules top-to-bottom, first match "
        "wins. (1) HG Processor — refund_vs_store >+10pp AND gross >$5K; "
        "matches gift-card recycling pattern, excluded before any "
        "productivity review. (2) Low Productivity — s_hr_vs_store <0.60 AND "
        "hours >100; <60% own store = genuine underperformer; 100-hr floor "
        "keeps part-timers out. (3) High Refunds — refund_vs_store >+10pp "
        "AND gross ≤$5K; same signal as HG without the volume — either "
        "policy-abuse or low-denominator noise, worth a look. (4) Top "
        "Performer — s_hr_vs_store ≥1.50; genuine standout, not above-"
        "average. (5) Standard — residual. All thresholds store-relative — "
        "every metric benchmarks against the associate's own store, not the "
        "fleet."
    ),
    # Deck s_m5_insights bullets (append_mechanic_slides.py:258-271) plus fleet
    # numbers wired from compute so the page mirrors the live deck rebuild.
    "key_insights": [
        "Distribution: HG Processor 63 · Low Productivity 14 · High Refunds "
        "18 · Top Performer 9 · Standard 497. 104 of 601 associates (17.3%) "
        "flagged — tight, actionable number. Each flag maps to a specific "
        "management action, not a generic watch-list.",
        "Store-relative comparison makes drill-down meaningful. A $200/hr "
        "associate at a $400/hr store is underperforming (50% of store RLH → "
        "Low Productivity); the same associate at a $150/hr store is a star "
        "(133% → headed toward Top Performer). Fleet averages miss both.",
        "HG Processors caught first by design (63 of 104 flagged, 61% of "
        "flagged pool). Without this filter, a naive refund-rate review "
        "would put them on 2-week notice for disciplinary action — the "
        "cascade catches them before any performance evaluation. Reassign, "
        "don't discipline.",
        "14 genuine Low Productivity underperformers across 120 stores after "
        "all filters apply. 100-hour minimum excludes part-timers. HG "
        "Processor exclusion removes false positives. Store-relative "
        "threshold removes fleet distortion. What's left is surgically "
        "precise — the real coaching list.",
        "9 Top Performers at ≥150% store RLH — recognition-surface "
        "counterpart to the flagged pool. Same cascade pipeline, opposite "
        "ontologyity. Accountability becomes fair rather than purely punitive: "
        "stick-and-carrot symmetry from one data source.",
    ],
    # 5 rows — verbatim from deck s_m5_table (append_mechanic_slides.py:
    # 382-407). Columns match deck's Priority / Flag / Criteria / Count /
    # Reasoning, adapted to Domain / Metric / G / Y / R / Reasoning shape
    # that the MechanicPage AlgorithmsTable expects. Priority = cascade order.
    "algorithms": [
        {
            "domain":    "HG Processor",
            "metric":    "refund_vs_store >+10pp AND gross >$5K",
            "green":     "—",
            "yellow":    "—",
            "red":       "MATCH",
            "reasoning": "Must exclude before evaluating productivity. "
                         "Highest priority in the cascade — HG Processors "
                         "ring both sides of the gift-card cycle; their "
                         "productivity numbers are structurally distorted. "
                         "Reassign, don't discipline.",
        },
        {
            "domain":    "Low Productivity",
            "metric":    "s_hr_vs_store <0.60 AND hours >100",
            "green":     "—",
            "yellow":    "—",
            "red":       "MATCH",
            "reasoning": "<60% own store = genuine underperformer. 100-hour "
                         "minimum keeps part-timers out of this bucket "
                         "(volume-biased cut — see weakness #2). "
                         "Store-relative ratio adapts to each store's "
                         "natural productivity regime.",
        },
        {
            "domain":    "High Refunds",
            "metric":    "refund_vs_store >+10pp AND gross ≤$5K",
            "green":     "—",
            "yellow":    "MATCH",
            "red":       "—",
            "reasoning": "Same pattern as HG Processor but low volume — "
                         "either a part-timer with a return-heavy shift "
                         "pattern or a policy-abuse candidate. Yellow, not "
                         "red: investigate first, act second.",
        },
        {
            "domain":    "Top Performer",
            "metric":    "s_hr_vs_store ≥1.50",
            "green":     "MATCH",
            "yellow":    "—",
            "red":       "—",
            "reasoning": "150% = genuine standout, not just above average. "
                         "50pp clear of fleet-median productivity. "
                         "Recognition surface — same pipeline as the "
                         "2-Week Notice Trigger, opposite ontologyity.",
        },
        {
            "domain":    "Standard",
            "metric":    "everyone else (residual)",
            "green":     "MATCH",
            "yellow":    "—",
            "red":       "—",
            "reasoning": "Within store norms on both productivity and refund "
                         "rate. 497 associates — the quiet majority. No "
                         "action. Catch-all is load-bearing: makes 'flagged' "
                         "mean something specific.",
        },
    ],
    # 10 weaknesses — DRAFT (pending Jack's QA append to mechanics-algo-
    # weaknesses.md §Mechanic #5). Mirror Red Count / rev_decomp / attr_gap /
    # hg_processor 1-line rule + 1-line v2 fix pattern. Drafted from deck
    # footer caveat + associate_perf column META rationale + improvements
    # catalog entries (hg_processor_perf_isolation, part_time_productivity,
    # two_week_notice_trending, recognition_program).
    "weaknesses": [
        {
            "rule":   "First-match-wins collapses co-occurring flags into "
                      "one label. An HG Processor who is ALSO genuinely "
                      "unproductive (non-HG-adjusted S/Hr <60% store RLH) "
                      "gets only the HG label — their selling behavior is "
                      "invisible. 63 HG Processors could hide meaningful "
                      "dual-flag cases.",
            "v2_fix": "Multi-flag surface — non-HG-adjusted S/Hr + non-HG "
                      "Refund Rate as first-class metrics; HG Processor "
                      "becomes a context flag, not a cascade-ender.",
        },
        {
            "rule":   "100-hour cumulative floor on Low Productivity is "
                      "volume-biased, not rate-biased. Part-time "
                      "underperformers with genuinely poor S/Hr disappear "
                      "into the 497 Standard pool unexamined. Current Low "
                      "Productivity count (14) is full-timer-biased by "
                      "construction.",
            "v2_fix": "Minimum-shift floor (e.g. ≥3 shifts) + rate-based "
                      "evaluation. Shift-level hours unlock part-timer "
                      "assessment without false-flagging single-shift "
                      "noise.",
        },
        {
            "rule":   "Monthly snapshot — cascade is static. An associate "
                      "crossing into Low Productivity mid-month is "
                      "invisible until next month's review. Consecutive "
                      "weeks of decline are undetectable; one bad week + "
                      "one great week average to invisible.",
            "v2_fix": "Rolling weekly aggregates + consecutive-week decline "
                      "detection → 2-Week Notice Trigger. Forward-looking "
                      "alert, not backward-looking report.",
        },
        {
            "rule":   "Cascade order is load-bearing but invisible to the "
                      "end user. HG → Low Prod → High Ref → Top Perf → "
                      "Standard encodes the diagnostic priority; the VP "
                      "sees one flag and the rule chain that got there is "
                      "not exposed.",
            "v2_fix": "Surface the full cascade trace per row ('Low "
                      "Productivity fired because S/Hr 42% < 60% AND "
                      "hours 142; did NOT fire HG because refund_vs_store "
                      "+3pp < 10'). Transparency on why-this-flag.",
        },
        {
            "rule":   "Top Performer at ≥150% store RLH is celebrated but "
                      "not surfaced. 9 associates currently sit in a "
                      "spreadsheet — no automated recognition pipeline. "
                      "Accountability is purely punitive: flags escalate "
                      "but kudos don't.",
            "v2_fix": "Recognition alerts (Slack/email to RM/VP) via the "
                      "same cascade pipeline. Stick-and-carrot symmetry; "
                      "depends on two_week_notice_trending shipping first.",
        },
        {
            "rule":   "Blank store-relative cols silently route associates "
                      "to Standard. Los Gatos (2) + Rockingham Park (1) + "
                      "Shops around Lenox Associate 184 have blank "
                      "s_hr_vs_store / refund_vs_store (source-data gap or "
                      "gross=0) — they fall through to Standard regardless "
                      "of actual performance. Not flagged AND not surfaced "
                      "as data-quality exceptions.",
            "v2_fix": "Explicit 'unmatched — data gap' bucket separate "
                      "from Standard; ingest-side canonical staff_id + "
                      "store mapping resolves the join gap upstream.",
        },
        {
            "rule":   "Store-relative baselines themselves are monthly "
                      "snapshots. A store whose RLH is inflated by one "
                      "holiday week produces a too-easy baseline; the "
                      "following month it flips. Associates at volatile "
                      "stores swing between Top Performer and Low "
                      "Productivity for reasons orthogonal to their work.",
            "v2_fix": "Rolling multi-month store RLH baseline; or "
                      "traffic-tier + season composite to dampen single-"
                      "week distortion.",
        },
        {
            "rule":   "+10pp absolute threshold across fleet refund-rate "
                      "regimes. A +10pp deviation at 8% store return (25% "
                      "relative bump) is structurally different from +10pp "
                      "at 35% (29% bump) — absolute pp carries different "
                      "statistical meaning across the distribution.",
            "v2_fix": "Multiplicative or percentile cut (e.g. refund rate "
                      ">2× store return rate), not absolute pp delta. "
                      "Consistent with the same weakness in HG Processor "
                      "detection.",
        },
        {
            "rule":   "S/Hr 0.60 and 1.50 ratios are fleet-constant — same "
                      "for every store. Aspen (786 traffic) and Orlando "
                      "(5,777 traffic) get the same cuts; category-mix and "
                      "traffic-tier effects aren't controlled for. The "
                      "'<60% of store RLH' label is coarser than the "
                      "rationale claims.",
            "v2_fix": "Traffic-tier-adjusted cuts (e.g. bottom 10th "
                      "percentile within tier), or cohort-normed z-score. "
                      "Threshold self-calibrates per peer group.",
        },
        {
            "rule":   "High Refunds bucket (18 associates) is an "
                      "investigate-not-decide label — the cascade flags "
                      "the pattern but can't say whether it's policy abuse, "
                      "returns-desk shift assignment, or a systematic "
                      "training gap. All three need different actions; the "
                      "flag surfaces none of them.",
            "v2_fix": "Transaction-level refund chain linked to staff_id + "
                      "shift pattern — distinguishes return-desk-only "
                      "shifts from pattern abuse from coaching gaps.",
        },
    ],
    # Diagram spec — shared CascadeFlowchart (built Phase 3 for attr_gap,
    # reused here per plan §Phases 2-6). Source = associates; click filters
    # Associate Performance to the perf_flag bucket via BiTable `filter` prop.
    "diagram": {
        "kind": "cascade_flowchart",
        "spec": {
            "source_label": "601 associates",
            "click_through": {
                "target_view":  "bi",
                "target_id":    "associate_perf",
                "filter_field": "perf_flag",
            },
        },
    },
    "takeaways": [
        "The cascade reduces 601 associates to a 104-person action list "
        "with a named action per flag. HG Processor → reassign; Low "
        "Productivity → coach; High Refunds → investigate; Top Performer → "
        "recognize; Standard → no action. Every flag is wired to a "
        "management behavior, not a generic watch-list.",
        "Cascade order is the single most load-bearing diagnostic choice "
        "in the app. HG Processor firing first prevents 63 false-positive "
        "disciplinary actions on associates doing a different job — the "
        "wrong coaching at ~11% of the associate base.",
        "Store-relative throughout — S/Hr benchmarks against store RLH, "
        "refund rate against store return rate. Fleet averages would flag "
        "a $200/hr associate at a $400/hr store as above-average (wrong) "
        "and a $200/hr associate at a $150/hr store as below-average "
        "(also wrong). Same dollar, opposite reads.",
        "v1 single-label cascade — clean for VP scan, hides co-occurring "
        "signals. v2 multi-flag surface (with non-HG-adjusted metrics) + "
        "consecutive-week trending + recognition pipeline + per-tier "
        "thresholds. Each v2 lever is a specific improvement-catalog entry "
        "(see Ontology Improvements section).",
    ],
    "source_notes": (
        "Insights and 5-row priority cascade table verbatim from deck "
        "scripts/append_mechanic_slides.py s_m5_insights (:258-271) + "
        "s_m5_table (:382-407). Counts are live from compute — deck numbers "
        "derive from the same associate_perf.compute path at render time. "
        "Weaknesses DRAFT pending append to notes/mechanics-algo-"
        "weaknesses.md §Mechanic #5. Compute reuses bi.associate_perf.compute "
        "— rule cascade implemented inline in col W (lines 434-443) is the "
        "single source of truth. No dedicated helper; mechanic aggregates "
        "rows by perf_flag value."
    ),
}


def compute(conn) -> dict:
    """Build the 5-bucket cascade flowchart data + per-associate rows.

    Returns:
        {
          rows: [
            {associate_id, associate_name, store, perf_flag, perf_flag_key,
             gross_sales, refund_rate, refund_vs_store, s_hr_vs_store,
             hours, hg_processor},
            ...  (601 rows, sorted by perf_flag severity desc then gross desc)
          ],
          buckets: [
            {key, label, count, severity, example_associates, criteria,
             description, action},
            ...  (5 buckets in cascade evaluation order)
          ],
          fleet: {
            total_associates, total_flagged, hg_processor_count,
            low_productivity_count, high_refunds_count, top_performer_count,
            standard_count,
          },
        }

    Reuses bi.associate_perf.compute(conn) 1:1 — every perf_flag string and
    every cascade rule lives in associate_perf.
    """
    ap = associate_perf.compute(conn)
    ap_rows = ap["rows"]

    # --- Per-associate rows ---------------------------------------------------
    out_rows: list[dict] = []
    for r in ap_rows:
        flag = r.get("perf_flag") or "Standard"  # "" → Standard for cascade
        out_rows.append({
            "associate_id":     r.get("staff_id"),
            "associate_name":   (
                f"Staff {r['staff_id']}" if r.get("staff_id") is not None else None
            ),
            "store":            r.get("store"),
            "perf_flag":        flag,
            "perf_flag_key":    _LABEL_TO_KEY.get(flag, "standard"),
            "gross_sales":      r.get("gross_sales"),
            "refund_rate":      r.get("refund_rate"),
            "refund_vs_store":  r.get("refund_vs_store"),
            "s_hr_vs_store":    r.get("s_hr_vs_store"),
            "hours":            r.get("hours"),
            "hg_processor":     r.get("hg_processor"),
        })

    # --- Bucket aggregates + example associates -------------------------------
    rows_by_flag: dict[str, list[dict]] = {b["label"]: [] for b in _BUCKET_DEFS}
    for r in out_rows:
        lst = rows_by_flag.get(r["perf_flag"])
        if lst is not None:
            lst.append(r)

    # Example-selection signal per bucket — pick the associates most
    # representative of *why* each bucket fires (deck spotlight stores).
    def _example_signal(label: str, r: dict) -> float:
        if label in ("HG Processor", "High Refunds"):
            # Largest refund-vs-store delta = most extreme matches
            return -(r.get("refund_vs_store") or 0)
        if label == "Low Productivity":
            # Lowest s_hr_vs_store = worst productivity (negate for asc-via-desc)
            return (r.get("s_hr_vs_store") or 0)
        if label == "Top Performer":
            # Highest s_hr_vs_store
            return -(r.get("s_hr_vs_store") or 0)
        # Standard — pick highest gross so example list is stable + recognizable
        return -(r.get("gross_sales") or 0)

    buckets: list[dict] = []
    for b in _BUCKET_DEFS:
        in_bucket = rows_by_flag.get(b["label"], [])
        ex_sorted = sorted(in_bucket, key=lambda r: _example_signal(b["label"], r))
        examples: list[str] = []
        for r in ex_sorted[:3]:
            name = r.get("associate_name") or "—"
            store = r.get("store") or ""
            examples.append(f"{name}{(' · ' + store) if store else ''}")

        # Field names match CascadeFlowchart's CascadeBucket interface
        # (example_stores + ontology_fix) — shared component across mechanics,
        # so we reuse the same keys. `example_stores` holds associate
        # display names for this mechanic; `ontology_fix` holds the
        # management action. Same UX idiom as attr_gap cascade.
        buckets.append({
            "key":            b["key"],
            "label":          b["label"],
            "filter_value":   "" if b["label"] == "Standard" else b["label"],
            "count":          len(in_bucket),
            "severity":       b["severity"],
            "example_stores": examples,
            "criteria":       b["criteria"],
            "description":    b["description"],
            "ontology_fix":      b["action"],
        })

    # --- Fleet aggregates -----------------------------------------------------
    counts = {b["label"]: len(rows_by_flag.get(b["label"], [])) for b in _BUCKET_DEFS}
    total_associates = len(out_rows)
    total_flagged = total_associates - counts.get("Standard", 0)

    fleet = {
        "total_associates":         total_associates,
        "total_flagged":            total_flagged,
        "hg_processor_count":       counts.get("HG Processor", 0),
        "low_productivity_count":   counts.get("Low Productivity", 0),
        "high_refunds_count":       counts.get("High Refunds", 0),
        "top_performer_count":      counts.get("Top Performer", 0),
        "standard_count":           counts.get("Standard", 0),
    }

    # Sort out_rows: flagged first (severity desc: red→yellow→green→standard),
    # then gross desc within each bucket — deck-spotlight associates rise to
    # the top of any client-side filter.
    _severity_order = {"red": 0, "yellow": 1, "green": 2}
    _bucket_by_label = {b["label"]: b for b in _BUCKET_DEFS}
    def _row_sort_key(r: dict) -> tuple:
        label = r["perf_flag"]
        b = _bucket_by_label.get(label, {})
        sev = _severity_order.get(b.get("severity", "green"), 3)
        # Standard lives at the tail regardless of severity color
        is_standard = 1 if label == "Standard" else 0
        return (is_standard, sev, -(r.get("gross_sales") or 0))
    out_rows.sort(key=_row_sort_key)

    return {
        "rows":    out_rows,
        "buckets": buckets,
        "fleet":   fleet,
    }
