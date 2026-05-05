"""Ontology Improvements catalog — single source of truth across all BI dashboards.

Sourced from career/interview/round-3/mechanics-reference.md §§ MECHANIC 1-6
Ontology Improvements + §ONTOLOGY IMPROVEMENTS SUMMARY. Every item maps directionally
to a passage in that reference; no invented improvements.

Each improvement has a stable `id` (slug) so the forthcoming task-viewer sync
(Phase 10) can be idempotent — re-export overwrites by id, not position.

Schema
------
  id                    — stable slug, used as Notion page key
  title                 — short label
  current_weakness      — what's broken in the current metric
  ontology_fix             — what Ontology does differently
  output_value          — the outcome / value to VP
  how_ontology_uses        — pipeline / semantic-layer mechanism
  mechanic              — which Mechanic (from the 6-mechanic taxonomy) this belongs to
                           (red_count | rev_decomp | attr_gap | hg_processor |
                            perf_flag_cascade | fine_rev | platform)
                           "platform" = cross-cutting infrastructure, not owned by
                           any single mechanic; valid under strict=True.
  bi_ids                — list of BI dashboards where this improvement surfaces
  priority              — P0 (structural unlock) | P1 (specific actionable) | P2 (polish)
  effort                — S (config) | M (ingest/pipeline) | L (new platform capability)
  revenue_opportunity   — $-framed value if applicable, else None
  depends_on            — list of improvement ids that must ship first
  unlocks               — list of improvement ids this directly enables (inverse of depends_on)
  capability_group      — ingest_foundation | diagnostic_chain | terminal_action | operational_win
  cross_mechanic_impact — list of mechanic ids affected beyond the primary `mechanic` field
  retailer_action       — string describing what retailer must do to enable this, or None

Rendering
---------
Each BI's META gets `ontology_improvements = improvements_for(bi_id)`. Frontend
renders as a "Ontology Improvements (N)" collapsible section in the RightPanel
BiHelper, sorted P0 → P1 → P2, then by effort S → M → L.
"""

from __future__ import annotations

from typing import Any


CATALOG: list[dict[str, Any]] = [
    # =========================================================================
    # M2 Revenue Decomposition — HG Intel (+ Attribution HG-Driven flag)
    # =========================================================================
    {
        "id": "tx_level_payment_tags",
        "title": "Transaction-Level Payment Method Tagging",
        "current_weakness":
            "Est GC Rev = GC Issued × Store AOV is the weakest formula in the "
            "model. Four blind spots: (1) no redemption rate — assumes 100%; "
            "(2) no cross-store flow — GC issued at A, redeemed at C is "
            "invisible; (3) no timing; (4) no partial-use tracking. Fashion "
            "Island overshoots to 209% because the estimate breaks at "
            "high-volume recycle stores.",
        "ontology_fix":
            "Every order tagged cash/card/gift-card at point of sale. Replace "
            "the Est GC Rev formula entirely — read what happened, not "
            "estimate it. Cross-store GC redemption flow becomes a "
            "first-class event.",
        "output_value":
            "Precise Est GC Rev per store (measured, not estimated). Fashion "
            "Island's 209% overshoot stops. HG-Driven Attribution flag "
            "becomes precise — current 3 flags get correctly reclassified. "
            "Ontology Net Revenue becomes audit-grade. "
            "Also prerequisite for HG Processor v2: payment tags make each "
            "GC redemption traceable to the associate who rang it. Without "
            "this, tx_level_refund_chain cannot close the associate-level "
            "cycle or compute self_redemption_rate.",
        "how_ontology_uses":
            "Ingest-layer payment tagging → semantic-layer GC-redemption "
            "event → cross-store GC ledger. Downstream: Est GC Rev, Recycle "
            "Rate, GC/Gross % all become measured not estimated.",
        "mechanic": "rev_decomp",
        "bi_ids": ["hg_intel", "attribution_intel"],
        "priority": "P0",
        "effort": "L",
        "revenue_opportunity":
            "$378K fleet GC recycling exposure + ~$40K Irvine Spectrum alone "
            "— precision stops mis-rewarding top-gross recycling-inflated "
            "stores",
        "depends_on": [],
        "unlocks": [
            "cross_store_gc_tracking",
            "realtime_recycle_alerts",
            "tx_level_attribution",
            "tx_level_refund_chain",
        ],
        "capability_group": "ingest_foundation",
        "cross_mechanic_impact": ["rev_decomp", "hg_processor", "attr_gap"],
        "retailer_action":
            "POS must tag payment method (cash/card/GC) at point of sale.",
    },
    {
        "id": "cross_store_gc_tracking",
        "title": "Cross-Store Gift Card Flow Tracking",
        "current_weakness":
            "GC issued at Store A, redeemed at Store C is currently invisible. "
            "All GC inflation assigned to issuing store regardless of where "
            "redemption actually occurs. Masks true cross-store revenue flow.",
        "ontology_fix":
            "GC issuance and redemption are separate events linked by card ID. "
            "See where inflation actually lands — store-of-issue vs "
            "store-of-redemption.",
        "output_value":
            "Per-store GC exposure becomes true-redemption-attributable. "
            "Stores that issue heavily but see redemptions elsewhere stop "
            "getting penalized; receiving stores surface as GC-revenue-heavy.",
        "how_ontology_uses":
            "Transaction-level GC events (issue + redeem) linked by card ID. "
            "Semantic-layer chain; Recycle Rate computed per-store-of-"
            "redemption, not per-store-of-issue.",
        "mechanic": "rev_decomp",
        "bi_ids": ["hg_intel"],
        "priority": "P0",
        "effort": "L",
        "revenue_opportunity": None,
        "depends_on": ["tx_level_payment_tags"],
        "unlocks": [],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["rev_decomp"],
        "retailer_action": None,
    },
    {
        "id": "realtime_recycle_alerts",
        "title": "Real-Time Recycle Rate Monitoring",
        "current_weakness":
            "Revenue decomposition is a monthly snapshot. Recycle Rate trends "
            "over time aren't visible; a store crossing the >30% threshold "
            "mid-month is invisible until the waterfall rebuilds.",
        "ontology_fix":
            "Rolling Recycle Rate + alerts on threshold crossings (>30% green, "
            "<15% red). Mid-period signal, not month-end.",
        "output_value":
            "Early warning on HG program health per store. Fashion Island's "
            "40.8% Recycle surfaces as it happens, not retrospectively.",
        "how_ontology_uses":
            "Streaming ingest of GC + returns data → rolling Recycle Rate "
            "aggregate → threshold-breach alerts via notification pipeline.",
        "mechanic": "rev_decomp",
        "bi_ids": ["hg_intel"],
        "priority": "P1",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": ["tx_level_payment_tags", "sub_monthly_ingest"],
        "unlocks": [],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["rev_decomp"],
        "retailer_action": None,
    },

    # =========================================================================
    # M3 Attribution Gap — Attribution Intel
    # =========================================================================
    {
        "id": "canonical_staff_ids",
        "title": "Canonical Staff IDs at Ingest",
        "current_weakness":
            "Staff matching runs on SUMPRODUCT name lookups across three "
            "sheets. Fragile string matching breaks on nicknames, typos, name "
            "changes. 6 mismatches found in this dataset alone — including "
            "Los Gatos (2 associates) and Rockingham Park (1 associate) who "
            "exist in both Staff+ and Staff Hours+ but have no Store+ row. "
            "Both locations are invisible in the 120-store output; those 3 "
            "associates' gross is silently excluded from the dataset entirely. "
            "3 Reverse Gap stores can't be diagnosed — cascade flags the "
            "anomaly but can't explain whether it's cross-location crediting "
            "or a join artifact.",
        "ontology_fix":
            "Every transaction links to a staff record by unique canonical "
            "ID at ingest. String-match fragility disappears. Cross-tab "
            "joins become reliable.",
        "output_value":
            "Reverse Gap (3 stores) becomes diagnosable, not just flaggable. "
            "Los Gatos and Rockingham Park — ghost locations excluded from the "
            "120-store output — surface as real stores with proper attribution. "
            "Closes the diagnostic gap on every cascade flag.",
        "how_ontology_uses":
            "Ingest layer assigns canonical staff_id on enrollment → all "
            "downstream tables (staff_hours, transactions, refunds) join on "
            "canonical_id → string-match removed from reconciliation.",
        "mechanic": "attr_gap",
        "bi_ids": ["attribution_intel", "associate_perf"],
        "priority": "P0",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": [],
        "unlocks": [
            "tx_level_attribution",
            "coverage_gap_diagnostic",
            "tx_level_refund_chain",
            "tx_level_fine_per_associate",
        ],
        "capability_group": "ingest_foundation",
        "cross_mechanic_impact": ["attr_gap", "hg_processor", "fine_rev"],
        "retailer_action":
            "Staff enrollment must capture canonical ID on first scan. "
            "One-time migration for existing associates — surfaces Los Gatos "
            "and Rockingham Park as real stores rather than ghost locations "
            "silently excluded from the 120-store output.",
    },
    {
        "id": "tx_level_attribution",
        "title": "Transaction-Level Attribution",
        "current_weakness":
            "Cascade flags 10 Refund-Driven + 3 HG-Driven stores using "
            "store-level deltas and proxy estimates. Refund Gap $ tells you "
            "the gap exists, not who processed the return. Est GC Revenue "
            "assumes every GC redeems at issuing store at avg price — "
            "Fashion Island's 209% overshoot is the pathology.",
        "ontology_fix":
            "Every refund links to the associate who processed it. Every GC "
            "payment is actual revenue, not a formula. Durham's $10.4K refund "
            "gap becomes a transaction list, not a mystery number.",
        "output_value":
            "HG-Driven + Refund-Driven flags become precise. Misclassified "
            "stores get correctly reclassified. Durham's $10.4K refund gap "
            "becomes a transaction list, not a mystery number.",
        "how_ontology_uses":
            "Transaction-level pipeline (depends on canonical staff IDs) → "
            "refund-chain audit trail → GC redemption ledger. Refund Gap $ "
            "becomes a row-level reconciliation, not a store-level delta.",
        "mechanic": "attr_gap",
        "bi_ids": ["attribution_intel"],
        "priority": "P0",
        "effort": "L",
        "revenue_opportunity":
            "$2.37M fleet attribution gap — transaction-level attribution "
            "converts the opaque total into an actionable per-transaction list",
        "depends_on": ["canonical_staff_ids", "tx_level_payment_tags"],
        "unlocks": ["multi_factor_attribution"],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["attr_gap"],
        "retailer_action": None,
    },
    {
        "id": "coverage_gap_diagnostic",
        "title": "Coverage Gap Diagnostic Suite",
        "current_weakness":
            "20 Coverage Gap stores flagged on fleet-relative P75 Traffic/"
            "Staff — but Irvine Spectrum (highest-traffic store, low gap) "
            "proves volume pressure isn't the universal root cause. Compliance "
            "is achievable under high traffic. Ontology has the signal (which "
            "stores gap) but not the diagnostic data to prescribe the right "
            "fix per store. Bethesda's 59% gap surfaces month-end, not week "
            "one. P75 threshold is fleet-relative — shifts if fleet "
            "composition changes.",
        "ontology_fix":
            "Badge scan rate as first-class POS metric: scan/no-scan per "
            "transaction separates 'associate not present' from 'associate "
            "present, didn't scan'. Store behavioral benchmarking cross-tabs "
            "Coverage Gap vs associate tenure, manager tenure, staff density "
            "— finds the Irvine pattern and prescribes the right lever per "
            "store. Onboarding risk flag pre-surfaces stores with high % "
            "associates <90 days before the gap opens. Store-relative alerts "
            "benchmark Traffic/Staff against each store's own 3-month "
            "baseline, not fleet P75.",
        "output_value":
            "20 Coverage Gap stores get a specific diagnosis per store — "
            "field ops knows whether to pull training, enforcement, or "
            "staffing lever. Bethesda's 59% gap flagged in week one. "
            "Onboarding risk surfaces before the gap opens.",
        "how_ontology_uses":
            "POS scan/no-scan event stream → per-store compliance rate. "
            "Behavioral benchmarking: cross-tab Coverage Gap vs associate "
            "tenure, manager tenure, staff density. Store-relative alert: "
            "flag when Traffic/Staff crosses store's own 3-month baseline "
            "+ 15%. Hire date → onboarding risk tier.",
        "mechanic": "attr_gap",
        "bi_ids": ["attribution_intel"],
        "priority": "P1",
        "effort": "M",
        "revenue_opportunity":
            "20 Coverage Gap stores — largest actionable attribution bucket. "
            "Root cause diagnosis determines which stores need training vs "
            "enforcement vs staffing change.",
        "depends_on": ["canonical_staff_ids"],
        "unlocks": [],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["attr_gap"],
        "retailer_action":
            "Share badge scan event logs from POS system. Associate hire "
            "dates needed for onboarding risk flag.",
    },
    {
        "id": "multi_factor_attribution",
        "title": "Multi-Factor Attribution Diagnostics",
        "current_weakness":
            "Cascade assigns one flag per store — deliberate for VP clarity. "
            "But a store can be Coverage Gap AND Refund-Driven simultaneously. "
            "18 High Gap stores today are a catch-all — \"we see the gap but "
            "can't isolate the cause\". No specific diagnosis. First-match-wins "
            "logic discards the signal from every lower-ranked condition.",
        "ontology_fix":
            "Remove first-match-wins. Evaluate all 7 cascade conditions "
            "simultaneously and rank by dollar contribution. All conditions "
            "use existing store-level aggregates — this is a cascade logic "
            "change, not a data pipeline change. Tx-level data raises "
            "precision ceiling but isn't the gate: Refund Gap$ and Reverse "
            "Gap$ are measured now; Coverage and HG contributions are "
            "estimated from proxy formulas with confidence tiers shown.",
        "output_value":
            "18 High Gap catch-all stores break into ranked factor lists. "
            "Stores with multiple contributing factors get all of them, "
            "ordered by dollar impact. Confidence tiers distinguish measured "
            "factors (Refund-Driven: medium, Reverse: high) from estimated "
            "ones (Coverage: low, HG: low). With tx-level data, every factor "
            "becomes auditable — estimated labels drop.",
        "how_ontology_uses":
            "Per-store: evaluate all cascade conditions, compute dollar proxy "
            "per factor (Refund Gap$, Est GC contribution, Coverage residual, "
            "Gap$ overshoot), rank descending. Flag confidence tier per "
            "factor. Output: ranked contribution list with confidence, not "
            "single-winner flag.",
        "mechanic": "attr_gap",
        "bi_ids": ["attribution_intel"],
        "priority": "P1",
        "effort": "S",
        "revenue_opportunity":
            "18 High Gap stores today unassigned → become specifically "
            "actionable. Stores with multiple contributing factors get ranked "
            "intervention list rather than one prescriptive fix.",
        "depends_on": ["tx_level_attribution"],
        "unlocks": [],
        "capability_group": "terminal_action",
        "cross_mechanic_impact": ["attr_gap"],
        "retailer_action": None,
    },

    # =========================================================================
    # M4 HG Processor Detection — AP + HG Intel
    # =========================================================================
    {
        "id": "tx_level_refund_chain",
        "title": "Transaction-Level Refund Chain Tracking",
        "current_weakness":
            "HG Processor detection is a monthly statistical proxy (refund "
            "rate + $5K gross floor + store-relative threshold). Can't trace "
            "the full HG cycle: sale → return → GC issued → GC redeemed → by "
            "whom. 63 flagged processors are pattern-matched, not audited.",
        "ontology_fix":
            "Full HG cycle visibility per processor. Trace the chain "
            "end-to-end per associate. Processor with $30K gross gets split "
            "into organic vs GC-funded revenue. "
            "Separates three patterns currently lumped under 'HG Processor': "
            "(1) Tier 1 — associate runs both ends, self_redemption_rate high "
            "→ escalate; "
            "(2) Tier 2 — GC redeemed same store, different associate → strip "
            "from all associates' gross metrics fleet-wide, not just the 63; "
            "(3) Tier 3 — GC redeemed at a different store → Rev Decomp "
            "cross-store flow, no associate action needed.",
        "output_value":
            "63 flagged processors become auditable — exact revenue each "
            "cycles and whether GC-funded purchases are new sales or same "
            "dollars making a round trip. Unblocks HG Processor Performance "
            "Isolation. "
            "Scope is fleet-wide for Tier 2: any associate who rang a GC "
            "redemption sale has inflated gross regardless of whether they're "
            "among the 63 flagged processors.",
        "how_ontology_uses":
            "Linked event chain per card ID + associate: return event → GC "
            "issue → GC redemption (same or different associate/store). "
            "Stored in semantic layer.",
        "mechanic": "hg_processor",
        "bi_ids": ["associate_perf", "hg_intel"],
        "priority": "P0",
        "effort": "L",
        "revenue_opportunity": None,
        "depends_on": ["canonical_staff_ids", "tx_level_payment_tags"],
        "unlocks": ["hg_processor_perf_isolation"],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["hg_processor", "perf_flag_cascade", "rev_decomp"],
        "retailer_action": None,
    },
    {
        "id": "weekly_hg_drift_alerts",
        "title": "Weekly HG Processor Drift Alerts",
        "current_weakness":
            "HG Processor flag is a monthly snapshot. An associate crossing "
            "the +10pp store-relative threshold mid-month is invisible until "
            "the next monthly run. New cycling behavior takes 4+ weeks to "
            "surface.",
        "ontology_fix":
            "Streaming alerts when associates cross the +10pp threshold "
            "mid-period. New HG behavior surfaces in days, not weeks.",
        "output_value":
            "Forward-looking HG Processor detection. Catches behavior shift "
            "before it accumulates into a month of transactions.",
        "how_ontology_uses":
            "Rolling associate refund-rate vs rolling store return-rate → "
            "threshold-breach alert → notification pipeline.",
        "mechanic": "hg_processor",
        "bi_ids": ["associate_perf"],
        "priority": "P1",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": ["sub_monthly_ingest"],
        "unlocks": [],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["hg_processor"],
        "retailer_action": None,
    },

    # =========================================================================
    # Platform — Sub-Monthly Ingest (cross-cutting foundation)
    # =========================================================================
    {
        "id": "sub_monthly_ingest",
        "title": "Sub-Monthly Ingest Cadence",
        "current_weakness":
            "All BI is rebuilt on monthly snapshots. Trends, consecutive-week "
            "decline, rolling refund-rate drift, and threshold alerts are "
            "structurally impossible — there's only one data point per month.",
        "ontology_fix":
            "Daily (or weekly) ingest of transactions, hours, refunds, and "
            "ops-domain data. Monthly rebuild becomes a rolling aggregate. "
            "Consecutive-week detection, drift alerts, and trending become "
            "first-class capabilities.",
        "output_value":
            "Five downstream improvements unlock: two_week_notice_trending, "
            "weekly_hg_drift_alerts, fine_mix_trending, realtime_recycle_alerts, "
            "rolling_red_count. The platform shifts from retrospective reports "
            "to forward-looking signals.",
        "how_ontology_uses":
            "Daily export or webhook from POS/HR/ops systems → Ontology rolling "
            "aggregate pipeline → downstream metric re-evaluation on each "
            "ingest cycle.",
        "mechanic": "platform",
        "bi_ids": [
            "associate_perf", "hg_intel", "fine_mix_intel",
            "store_intel", "ops_compliance",
        ],
        "priority": "P0",
        "effort": "L",
        "revenue_opportunity": None,
        "depends_on": [],
        "unlocks": [
            "two_week_notice_trending",
            "weekly_hg_drift_alerts",
            "fine_mix_trending",
            "realtime_recycle_alerts",
            "rolling_red_count",
        ],
        "capability_group": "ingest_foundation",
        "cross_mechanic_impact": [
            "perf_flag_cascade", "hg_processor", "rev_decomp", "red_count", "fine_rev",
        ],
        "retailer_action":
            "Enable daily data export or webhook from POS, HR scheduling, and "
            "ops-domain systems. Ontology ingests via existing connector — "
            "retailer enables the frequency, not a new integration.",
    },

    # =========================================================================
    # M5 Performance Flag Cascade — AP
    # =========================================================================
    {
        "id": "hg_processor_perf_isolation",
        "title": "HG Processor Performance Isolation",
        "current_weakness":
            "Cascade catches 63 HG Processors first — then stops. "
            "\"HG Processor\" is the only flag they get, so their actual "
            "selling performance is invisible. An HG Processor who's ALSO a "
            "low producer hides behind the flag. Critically: even stripping "
            "HG revenue from the numerator leaves the hours denominator "
            "inflated — an associate who spent 60 of 160 hrs processing HG "
            "returns gets an organic Sales/Hour calculated over the full "
            "160 hrs, understating their true organic productivity rate. "
            "Second weakness: the +10pp / $5K floor flag captures a large "
            "low-confidence cohort in the +10-20pp range — associates who "
            "are red on S/Hr and barely above the threshold. HG transaction "
            "exposure isn't binary (HG Processor vs not); every associate "
            "who handles any GC return has some HG revenue mixed into their "
            "gross. The flag treats this as a role classification when the "
            "real problem is proportional — an associate might be 5% HG "
            "exposure or 80%, and the current snapshot can't tell. Binary "
            "labeling shadows Low Productivity for low-confidence associates "
            "and obscures the spectrum of mixed-responsibility cases above "
            "+20pp where GC issuance volume explains much of the delta.",
        "ontology_fix":
            "Three-part fix. (1) Tag HG transactions at ingest; strip from "
            "revenue aggregates — non-HG Refund Rate and non-HG gross become "
            "first-class metrics for every associate proportionally, not "
            "just the 63 flagged. (2) Allocate hours to HG vs non-HG via "
            "proxy: avg transaction handling time × HG transaction count = "
            "estimated HG processing hours. Organic Sales/Hour = non-HG "
            "revenue ÷ non-HG hours. (3) Replace binary HG Processor flag "
            "with HG exposure % — the share of an associate's gross derived "
            "from HG-tagged transactions. Low-confidence associates (+10-20pp, "
            "red S/Hr) surface as low performers with minor HG exposure; "
            "high-exposure associates are managed as a mixed-responsibility "
            "case, not a binary role reassignment.",
        "output_value":
            "HG Processors who are also underperforming get surfaced — "
            "currently invisible. Processor with 123% refund rate AND poor "
            "non-HG-adjusted Sales/Hour becomes a dual-flag case, not hidden "
            "by the HG label. Scope extends beyond the 63 flagged processors "
            "— every associate whose gross includes GC-funded redemptions "
            "(Tier 2) needs the same stripping. Correct organic Sales/Hour "
            "requires both a clean numerator AND a clean denominator; this "
            "task delivers both.",
        "how_ontology_uses":
            "HG-tagged transactions filtered out of revenue aggregates at "
            "query time. Hours proxy (avg handling time × HG tx count) "
            "allocated to HG pool; remainder is organic hours. Non-HG "
            "Sales/Hour = non-HG revenue ÷ organic hours. Non-HG Refund Rate "
            "and non-HG gross become top-level metric variants. Feeds "
            "two_week_notice_trending with HG-adjusted time-series metrics.",
        "mechanic": "perf_flag_cascade",
        "bi_ids": ["associate_perf"],
        "priority": "P0",
        "effort": "L",
        "revenue_opportunity": None,
        "depends_on": ["tx_level_refund_chain"],
        "unlocks": ["two_week_notice_trending"],
        "capability_group": "terminal_action",
        "cross_mechanic_impact": ["hg_processor", "perf_flag_cascade"],
        "retailer_action": None,
    },
    {
        "id": "part_time_productivity",
        "title": "Part-Time Productivity Assessment",
        "current_weakness":
            "100-hour minimum on Low Productivity prevents false-flagging "
            "part-timers on volume — but creates a blind spot. Part-time "
            "associates with genuinely poor rate metrics disappear into the "
            "497 Standard pool unexamined. Current 14 Low Productivity count "
            "excludes everyone under 100hrs by design, regardless of how "
            "poor their Sales/Hour ratio is.",
        "ontology_fix":
            "Three-bucket approach by hours worked. (1) 64–99 hrs: "
            "'Low Productivity - PT' flag — same S/Hr vs store <0.60 "
            "threshold as the full-timer flag, different label so managers "
            "read it with context. AOV excluded — too noisy at low "
            "transaction counts. (2) 16–63 hrs: surface as 'Underutilized' "
            "outside the perf cascade — this is a scheduling/availability "
            "question, not a performance flag. (3) <16 hrs: 'Review Status' "
            "— likely inactive, seasonal tail, or data artifact.",
        "output_value":
            "PT underperformers in the 64–99hr bucket become visible and "
            "actionable — coached on the same S/Hr benchmark as full-timers. "
            "Standard pool (497) shrinks as legitimate PT underperformers "
            "surface. Associates in the 16–63hr bucket expose scheduling "
            "gaps the cascade currently has no visibility into. Coaching "
            "list is no longer full-timer-biased.",
        "how_ontology_uses":
            "Cascade addition after existing Low Productivity branch: "
            "64 ≤ hours < 100 AND s_hr_vs_store < 0.60 → 'Low Productivity "
            "- PT'. Underutilized (16–63 hrs) and Review Status (<16 hrs) "
            "surface as a separate workforce view — not in perf_flag column, "
            "visible as a dashboard filter/count. Feeds two_week_notice_"
            "trending with PT associate time-series once flagged.",
        "mechanic": "perf_flag_cascade",
        "bi_ids": ["associate_perf"],
        "priority": "P1",
        "effort": "S",
        "revenue_opportunity": None,
        "depends_on": [],
        "unlocks": ["two_week_notice_trending"],
        "capability_group": "operational_win",
        "cross_mechanic_impact": ["perf_flag_cascade"],
        "retailer_action": None,
    },
    {
        "id": "two_week_notice_trending",
        "title": "Consecutive-Week Trending (2-Week Notice)",
        "current_weakness":
            "Cascade is a static monthly snapshot — one bad week and one "
            "great week average to invisible. A store trending toward "
            "crisis is undetectable until it arrives. Trending on raw "
            "metrics is also blind to HG-inflated performers: an HG "
            "Processor's declining organic productivity is masked by stable "
            "gross if GC-funded revenue is holding steady.",
        "ontology_fix":
            "Automated weekly alerts on HG-adjusted Sales/Hour, AOV, Refund "
            "Rate, Net Sales rank with consecutive-week requirement. Single "
            "off week doesn't trigger; two consecutive weeks of declining "
            "productivity does. Requires HG-adjusted metrics from "
            "hg_processor_perf_isolation as input.",
        "output_value":
            "Forward-looking early warning on organic productivity, not "
            "backward-looking report on gross. 2-Week Notice workflow "
            "triggered automatically by data pattern rather than manual "
            "monthly review. HG Processors and PT associates surface as "
            "distinct tiers within the same trending pipeline.",
        "how_ontology_uses":
            "Weekly rolling HG-adjusted metric aggregates per associate → "
            "consecutive-week decline detection → escalation alert. PT "
            "underperformers (surfaced by part_time_productivity) feed the "
            "same pipeline with shift-rate metrics instead of cumulative "
            "hours. Feeds the 2-Week Notice Trigger utility.",
        "mechanic": "perf_flag_cascade",
        "bi_ids": ["associate_perf"],
        "priority": "P0",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": ["hg_processor_perf_isolation"],
        "unlocks": ["recognition_program"],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["perf_flag_cascade"],
        "retailer_action": None,
    },
    {
        "id": "recognition_program",
        "title": "Automated Recognition Alerts",
        "current_weakness":
            "The same cascade that flags underperformers identifies 9 Top "
            "Performers at ≥150% store productivity — but today that data "
            "sits in a spreadsheet. No stick-and-carrot symmetry; "
            "accountability is purely punitive.",
        "ontology_fix":
            "Surface Top Performers for automated recognition alerts via "
            "the same cascade pipeline that flags underperformers.",
        "output_value":
            "Accountability becomes fair rather than purely punitive — "
            "same data pipeline feeds recognition. 9 Top Performers "
            "currently invisible get automated VP-facing alerts.",
        "how_ontology_uses":
            "Top Performer flag → recognition notification pipeline "
            "(Slack/email to RM/VP). Same alert infrastructure as the "
            "2-Week Notice, different threshold.",
        "mechanic": "perf_flag_cascade",
        "bi_ids": ["associate_perf"],
        "priority": "P2",
        "effort": "S",
        "revenue_opportunity": None,
        "depends_on": ["two_week_notice_trending"],
        "unlocks": [],
        "capability_group": "terminal_action",
        "cross_mechanic_impact": ["perf_flag_cascade"],
        "retailer_action": None,
    },

    # =========================================================================
    # M6 Fine Revenue Estimation — Fine Mix + AP
    # =========================================================================
    {
        "id": "tx_level_fine_per_associate",
        "title": "Transaction-Level Fine Revenue per Associate",
        "current_weakness":
            "Today's Est Fine Rev = Fine Units × Store Fine AOV. An associate "
            "selling one $3,000 ring and one $200 pair of earrings gets "
            "credited at the store's $415 average for both. Park City's "
            "$1,122 AOV masks individual associate selling patterns entirely. "
            "Denominator is equally dirty for HG-flagged associates: "
            "fine_rev_pct = est_fine_rev / gross_sales, but gross_sales "
            "includes GC-cycling revenue for HG processors — the denominator "
            "is inflated, making fine_rev_pct look artificially low even when "
            "the associate's actual fine selling is normal. Both numerator "
            "(store AOV proxy) and denominator (HG-inflated gross) are "
            "unreliable for this cohort.",
        "ontology_fix":
            "Capture actual sale price per piece at ingest. Per-associate "
            "fine revenue becomes a measured number, not a store-average "
            "proxy. Organic gross (GC-cycling stripped) must be the "
            "denominator for fine_rev_pct — same organic gross pool produced "
            "by hg_processor_perf_isolation. With both sides clean: "
            "fine_rev_pct_organic = actual_fine_rev / organic_gross.",
        "output_value":
            "Managers see which associates consistently sell high-ticket vs "
            "entry-level fine. Coaching shifts from \"sell more fine\" to "
            "\"here's your price point pattern vs your top performer's\". "
            "fine_rev_pct becomes a trustworthy coaching signal for HG-"
            "flagged associates — currently suppressed by denominator "
            "inflation. Unlocks Associate-Level Fine Coaching.",
        "how_ontology_uses":
            "Transaction-level line-item data → per-associate fine-line-"
            "item aggregation → true fine AOV per associate. AP cols L + M "
            "become measured, not estimated. fine_rev_pct denominator "
            "switches to organic gross for HG-flagged associates.",
        "mechanic": "fine_rev",
        "bi_ids": ["fine_mix_intel", "associate_perf"],
        "priority": "P0",
        "effort": "M",
        "revenue_opportunity":
            "$274K fleet fine opportunity — precision on per-associate "
            "level makes coaching targeted",
        "depends_on": ["canonical_staff_ids"],
        "unlocks": ["associate_fine_coaching", "visual_merch_integration"],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["fine_rev"],
        "retailer_action": None,
    },
    {
        "id": "fine_mix_trending",
        "title": "Fine Mix Trending Over Time",
        "current_weakness":
            "Quadrant classification is a single-month snapshot. A store "
            "trending from Mid toward Low+Low is invisible until it arrives. "
            "Naperville's 21% mix might be declining or recovering; the data "
            "can't tell.",
        "ontology_fix":
            "Weekly fine-mix trajectory per store. Dropping 2pp/month for "
            "three consecutive months triggers alert before hitting Low+Low.",
        "output_value":
            "Forward-looking quadrant drift detection. VP sees whether "
            "coaching is working or escalation is needed. Birmingham's $8K "
            "opportunity either grows or shrinks over time — trending makes "
            "it actionable.",
        "how_ontology_uses":
            "Weekly Fine Mix % aggregate per store → trend-line detection → "
            "escalation alert on sustained decline.",
        "mechanic": "fine_rev",
        "bi_ids": ["fine_mix_intel"],
        "priority": "P1",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": ["sub_monthly_ingest"],
        "unlocks": [],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["fine_rev"],
        "retailer_action": None,
    },
    {
        "id": "hg_aware_fine_rev_pct",
        "title": "HG-Aware Fine Revenue % (Organic Denominator)",
        "current_weakness":
            "fine_rev_pct = est_fine_rev / gross_sales. For HG-flagged "
            "associates, gross_sales includes GC-cycling revenue — the "
            "denominator is inflated, artificially depressing fine_rev_pct. "
            "Associates with red S/Hr who clear the +10pp HG bar (the "
            "low-confidence +10-20pp cohort) compound this: their gross is "
            "minimally HG-inflated, so their low fine_rev_pct is likely real "
            "underperformance — but the HG label suppresses the coaching "
            "signal entirely. Above +20pp, HG exposure is proportional and "
            "mixed: an associate isn't simply a processor or not, they have "
            "some share of HG-derived revenue distorting their denominator "
            "by that proportion. Both cases need the same fix.",
        "ontology_fix":
            "Interim (no tx-level data): surface a caveat indicator on "
            "fine_rev_pct for any HG-flagged associate rather than treating "
            "it as a clean coaching signal. With tx-level data: organic "
            "gross (cycling-stripped, from hg_processor_perf_isolation) "
            "replaces gross_sales as the denominator. fine_rev_pct_organic "
            "= est_fine_rev / organic_gross — clean signal for both cohorts.",
        "output_value":
            "fine_rev_pct becomes a trustworthy coaching signal across all "
            "HG-exposure levels. Low-confidence associates (+10-20pp, red "
            "S/Hr) get their Low Productivity flag unblocked — fine_rev_pct "
            "is real underperformance, not artifact. Higher-exposure "
            "associates get an organic denominator proportional to their "
            "actual non-HG gross. Managers can act on fine coaching without "
            "second-guessing whether HG exposure is distorting the number.",
        "how_ontology_uses":
            "HG-flagged associates in AP dashboard: fine_rev_pct cell gets "
            "caveat indicator (interim). Post-hg_processor_perf_isolation: "
            "organic_gross replaces gross_sales in fine_rev_pct denominator "
            "for flagged associates at query time.",
        "mechanic": "fine_rev",
        "bi_ids": ["associate_perf", "fine_mix_intel"],
        "priority": "P1",
        "effort": "S",
        "revenue_opportunity": None,
        "depends_on": ["hg_processor_perf_isolation"],
        "unlocks": ["associate_fine_coaching"],
        "capability_group": "diagnostic_chain",
        "cross_mechanic_impact": ["fine_rev", "hg_processor", "perf_flag_cascade"],
        "retailer_action": None,
    },
    {
        "id": "associate_fine_coaching",
        "title": "Associate-Level Fine Coaching",
        "current_weakness":
            "Per-associate fine_unit_pct already exists (AP col K) — attach "
            "rate visibility isn't the gap. The gap is price point: "
            "est_fine_rev = fine_units × store_fine_aov flattens a $200 "
            "earring and a $3,000 ring to the same store-average credit. "
            "An associate at Park City selling one fine piece gets $1,122 "
            "attributed; at Naperville, $200. We know who's selling fine "
            "but not what they're selling it at — coaching can't distinguish "
            "volume behavior from price-point behavior with a store proxy.",
        "ontology_fix":
            "Transaction-level fine revenue per associate (from "
            "tx_level_fine_per_associate) — actual sale price per piece "
            "replaces the store AOV proxy. Per-associate fine AOV becomes "
            "measurable: who sells high-ticket vs entry-level fine, "
            "independent of which store they're at.",
        "output_value":
            "Coaching shifts from \"sell more fine\" (attach rate, already "
            "visible) to \"here's your price-point pattern vs your top "
            "performer's\" (requires tx-level revenue). Park City's top "
            "seller's $1,122 average becomes a replicable benchmark, not "
            "a store-level aggregate. Same data pipeline as Associate "
            "Performance — fine-specific price-point lens.",
        "how_ontology_uses":
            "Transaction-level fine line-item → per-associate fine AOV "
            "= actual_fine_revenue / fine_units_sold. Replaces est_fine_rev "
            "in AP cols L + M. Cross-ref against fine_unit_pct (already "
            "live) to separate attach-rate coaching from price-point "
            "coaching for each associate.",
        "mechanic": "fine_rev",
        "bi_ids": ["fine_mix_intel", "associate_perf"],
        "priority": "P1",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": ["tx_level_fine_per_associate"],
        "unlocks": [],
        "capability_group": "terminal_action",
        "cross_mechanic_impact": ["fine_rev"],
        "retailer_action": None,
    },
    {
        "id": "visual_merch_integration",
        "title": "Visual Compliance × Merchandising Integration",
        "current_weakness":
            "Park City proves visual score doesn't predict fine revenue — "
            "worst compliance (3.0), best Fine AOV ($1,122). But current "
            "data stops at \"no correlation\". It can't answer WHY Park "
            "City sells fine or what it does differently.",
        "ontology_fix":
            "Connect fine-mix data to visual layout photos, inventory "
            "depth, promotional calendar, and staffing patterns. See actual "
            "drivers, not just the correlation.",
        "output_value":
            "Park City's $1,122 AOV despite worst visual compliance becomes "
            "an explainable, replicable playbook — not a compliance "
            "violation to fix. Identifies transferable selling patterns "
            "from non-compliant high-performers.",
        "how_ontology_uses":
            "Cross-domain semantic layer joining fine_mix, visual_photos, "
            "inventory_depth, promo_calendar, and shift patterns.",
        "mechanic": "fine_rev",
        "bi_ids": ["fine_mix_intel"],
        "priority": "P2",
        "effort": "L",
        "revenue_opportunity": None,
        "depends_on": ["tx_level_fine_per_associate"],
        "unlocks": [],
        "capability_group": "terminal_action",
        "cross_mechanic_impact": ["fine_rev"],
        "retailer_action": None,
    },

    # =========================================================================
    # M1 Red Count — Store Intel + Ops Compliance
    # =========================================================================
    {
        "id": "automated_ops_alerts",
        "title": "Automated Ops Alerts (10+ triggers)",
        "current_weakness":
            "Red Count is a monthly snapshot. VP has to compile the "
            "scorecard manually or wait for month-end. No per-domain "
            "threshold-breach alerting — stores crossing into red aren't "
            "surfaced until next review cycle.",
        "ontology_fix":
            "10+ ops triggers, each mapping to a VP concern from the "
            "discovery call. Real-time threshold-breach alerts per domain. "
            "Replaces monthly manual review with live feed.",
        "output_value":
            "11 Watch List stores surface immediately when they cross RC=2, "
            "not at month-end. Regional managers get alerts as stores drift. "
            "VP does no manual scorecard compilation.",
        "how_ontology_uses":
            "Streaming ingest of ops-domain data (payroll, visual, VOC, "
            "cash, inventory, HG) → per-domain threshold evaluator → "
            "notification pipeline with RM/VP routing.",
        "mechanic": "red_count",
        "bi_ids": ["store_intel", "ops_compliance"],
        "priority": "P0",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": [],
        "unlocks": ["rolling_red_count"],
        "capability_group": "operational_win",
        "cross_mechanic_impact": ["red_count"],
        "retailer_action": None,
    },
    {
        "id": "configurable_thresholds",
        "title": "Configurable G/Y/R Thresholds",
        "current_weakness":
            "Current thresholds (Attribution Gap >30%, Inventory ±10%, etc.) "
            "are defensible starting points but they're OUR assumptions. VP "
            "has no self-serve way to adjust the bar for this retailer's "
            "operating reality.",
        "ontology_fix":
            "VP-facing threshold config UI. Per-domain, per-metric cutoffs. "
            "Ontology enforces across every store in real time.",
        "output_value":
            "Ownership of the standard transfers to the operator. Thresholds "
            "become operator decisions, not platform assumptions. Opens the "
            "Day-1 \"is the payroll budget realistic?\" question into a "
            "resolvable config.",
        "how_ontology_uses":
            "Threshold config service → per-tenant rule overrides → applied "
            "at flag-evaluation layer. Changes propagate in near-real-time.",
        "mechanic": "red_count",
        "bi_ids": ["store_intel", "ops_compliance"],
        "priority": "P1",
        "effort": "S",
        "revenue_opportunity": None,
        "depends_on": [],
        "unlocks": [],
        "capability_group": "operational_win",
        "cross_mechanic_impact": ["red_count"],
        "retailer_action": None,
    },
    {
        "id": "rolling_red_count",
        "title": "Rolling Real-Time Red Count",
        "current_weakness":
            "Red Count is a month-end static snapshot. Carlsbad fixes "
            "payroll overspend in February — VP doesn't see the RC drop "
            "until March. Wins are invisible in near-real-time; so are "
            "emerging crises (RC=1 → RC=3 trend unobservable mid-period).",
        "ontology_fix":
            "RC updates as data flows in. Trend line from RC=1 → RC=3 "
            "surfaces before a store becomes a crisis. Visible wins when "
            "stores recover.",
        "output_value":
            "Near-real-time triage. Carlsbad's February fix shows in the "
            "dashboard as it happens. Emerging trouble stores catch "
            "attention days, not weeks, into their decline.",
        "how_ontology_uses":
            "Streaming re-evaluation of 8-domain thresholds → rolling RC "
            "per store → historical RC time-series → trend alerts.",
        "mechanic": "red_count",
        "bi_ids": ["store_intel", "ops_compliance"],
        "priority": "P1",
        "effort": "M",
        "revenue_opportunity": None,
        "depends_on": ["automated_ops_alerts", "sub_monthly_ingest"],
        "unlocks": [],
        "capability_group": "terminal_action",
        "cross_mechanic_impact": ["red_count"],
        "retailer_action": None,
    },
]


# Stable sort key: P0 → P1 → P2, then S → M → L, then id.
_PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2}
_EFFORT_ORDER = {"S": 0, "M": 1, "L": 2}


def _sort_key(item: dict[str, Any]) -> tuple:
    return (
        _PRIORITY_ORDER.get(item["priority"], 99),
        _EFFORT_ORDER.get(item["effort"], 99),
        item["id"],
    )


def improvements_for(bi_id: str) -> list[dict[str, Any]]:
    """Return improvements that surface on the given BI dashboard, sorted by
    priority (P0 first) then effort (S first)."""
    return sorted(
        [i for i in CATALOG if bi_id in i["bi_ids"]],
        key=_sort_key,
    )


def improvements_for_mechanic(mechanic_id: str) -> list[dict[str, Any]]:
    """Return improvements belonging to the given mechanic, sorted by
    priority (P0 first) then effort (S first). Used by the Mechanics
    cross-BI view to aggregate improvements across every BI that feeds
    that mechanic."""
    return sorted(
        [i for i in CATALOG if i["mechanic"] == mechanic_id],
        key=_sort_key,
    )


def contributing_bi_ids_for_mechanic(mechanic_id: str) -> list[str]:
    """Sorted union of bi_ids referenced by all improvements in the given
    mechanic. Drives the 'Touches these dashboards' chip row in the
    Mechanics RightPanel."""
    bi_set: set[str] = set()
    for item in CATALOG:
        if item["mechanic"] == mechanic_id:
            bi_set.update(item["bi_ids"])
    return sorted(bi_set)


def mechanic_ids() -> list[str]:
    """Distinct mechanic ids present in the catalog, in first-appearance order."""
    seen: list[str] = []
    for item in CATALOG:
        if item["mechanic"] not in seen:
            seen.append(item["mechanic"])
    return seen


def all_ids() -> list[str]:
    return [i["id"] for i in CATALOG]


# Field-value definitions — defensible meanings for every enum + rich_text
# tier, exposed at /api/improvements/field_definitions so the RightPanel can
# render chip tooltips and the future Notion DB description inherits the same
# copy. Revenue tiers anchored to $12.82M fleet Jan-2026 gross.
FIELD_DEFINITIONS: dict[str, dict[str, str]] = {
    "priority": {
        "P0": "Structural unlock — blocks multiple downstream improvements or "
              "fixes a formula that produces materially wrong numbers at snapshot "
              "(e.g. Est GC Rev → 209% overshoot). Ships before P1 by definition.",
        "P1": "Specific actionable — addresses a named dashboard gap or "
              "time-to-signal lag (e.g. monthly snapshot → rolling). Independent "
              "of P0 unlocks.",
        "P2": "Polish / symmetry — fairness, recognition, operator-experience "
              "surface. Doesn't move a number.",
    },
    "effort": {
        "S": "Config / threshold change. No new ingest, no schema change. Days.",
        "M": "Pipeline / ingest extension. New aggregate, rolling metric, or "
             "alert on existing schema. Weeks.",
        "L": "Platform capability. New tx-level event stream, cross-store ledger, "
             "or semantic-layer join. Quarter+.",
    },
    "capability_group": {
        "ingest_foundation": "Root platform capability. No deps. Enables chains "
                             "across multiple mechanics. Ships before anything in "
                             "diagnostic_chain.",
        "diagnostic_chain":  "Depends on at least one ingest_foundation item. "
                             "Converts pattern-match to audit, estimate to "
                             "measurement. Enables terminal_action.",
        "terminal_action":   "End-state capability. Depends on diagnostic_chain. "
                             "Unlocks nothing further — this is the full working "
                             "feature.",
        "operational_win":   "Independent of the tx-level data foundation. Works "
                             "on existing monthly snapshot data. Shippable now.",
    },
    "revenue_impact_tier": {
        "Large": "≥$250K named fleet-wide exposure. Anchored to $12.82M fleet "
                 "Jan-2026 gross. Examples: $378K GC recycling, $2.37M attribution "
                 "gap, $274K fine opportunity.",
        "Medium": "$50K-$250K named exposure, or a named cohort (e.g. 20 Coverage "
                  "Gap stores) where VP has a defensible per-cohort $ estimate.",
        "Small": "<$50K named, or unquantified-but-named impact. No invented "
                 "numbers — if we can't source it, field is Unsized.",
        "Unsized": "Real value, not yet quantified. Legitimate tier; forces "
                   "discipline by not letting us invent dollars.",
    },
    "status": {
        "Backlog":     "Catalog entry exists, no commitment yet.",
        "Ready":       "Scoped, unblocked, next-up.",
        "Blocked":     "depends_on unmet OR retailer_action pending.",
        "In-Progress": "Active work, owner assigned.",
        "Shipped":     "Live in an Ontology tenant / integration-tested.",
    },
}


def validate_against_registry(registry_bi_ids: list[str]) -> list[str]:
    """Cross-check: every bi_id referenced in the catalog must exist in the BI
    REGISTRY. Called at backend startup so drift surfaces immediately."""
    issues: list[str] = []
    valid = set(registry_bi_ids)
    for item in CATALOG:
        for bid in item["bi_ids"]:
            if bid not in valid:
                issues.append(f"{item['id']}: unknown bi_id {bid}")
    return issues


def validate_against_mechanic_registry(
    registry_mechanic_ids: list[str], strict: bool = False
) -> list[str]:
    """Cross-check catalog `mechanic` field against the mechanics REGISTRY.

    `strict=False` (default, during phased rollout): allows catalog items to
    reference future-phase mechanics (e.g. `rev_decomp` before Phase 2 ships).
    Only flags catalog rows whose `mechanic` field is the empty string or None.

    `strict=True` (post-Phase 7): every catalog `mechanic` value must exist in
    REGISTRY, with the exception of "platform" which is a special sentinel for
    cross-cutting infrastructure items — valid under both strict=False and
    strict=True.

    The complementary direction (every REGISTRY id must have ≥1 catalog item)
    is enforced at import time in mechanics/__init__.py.
    """
    issues: list[str] = []
    valid = set(registry_mechanic_ids)
    for item in CATALOG:
        mid = item.get("mechanic")
        if not mid:
            issues.append(f"{item['id']}: empty mechanic field")
            continue
        if strict and mid not in valid and mid != "platform":
            issues.append(f"{item['id']}: unknown mechanic {mid}")
    return issues


def validate_catalog() -> list[str]:
    """Return list of issues (empty = valid). Called at startup time defensively."""
    issues: list[str] = []
    seen: set[str] = set()
    all_item_ids = {i["id"] for i in CATALOG}
    for item in CATALOG:
        if item["id"] in seen:
            issues.append(f"duplicate id: {item['id']}")
        seen.add(item["id"])
        for dep in item.get("depends_on", []):
            if dep not in all_item_ids:
                issues.append(f"{item['id']}: unknown dependency {dep}")
        for uid in item.get("unlocks", []):
            if uid not in all_item_ids:
                issues.append(f"{item['id']}: unknown unlock {uid}")
    return issues


# Fail fast at import time if the catalog is internally inconsistent.
_issues = validate_catalog()
if _issues:
    raise RuntimeError(f"ontology_improvements catalog invalid: {_issues}")


# ─── Kanban enrichment ───────────────────────────────────────────────────────
# status and revenue_impact_tier are derived, not stored inline, so the catalog
# stays clean and these two fields can be updated without touching 20 items.

_STATUS_MAP: dict[str, str] = {
    # Ready — P0 with no deps
    "tx_level_payment_tags":       "Ready",
    "canonical_staff_ids":         "Ready",
    "automated_ops_alerts":        "Ready",
    "sub_monthly_ingest":          "Ready",
    # Blocked — has unmet deps
    "two_week_notice_trending":    "Blocked",
    "hg_aware_fine_rev_pct":       "Blocked",
    "cross_store_gc_tracking":     "Blocked",
    "realtime_recycle_alerts":     "Blocked",
    "tx_level_attribution":        "Blocked",
    "coverage_gap_diagnostic":     "Blocked",
    "multi_factor_attribution":    "Backlog",
    "tx_level_refund_chain":       "Blocked",
    "hg_processor_perf_isolation": "Blocked",
    "recognition_program":         "Blocked",
    "tx_level_fine_per_associate": "Blocked",
    "associate_fine_coaching":     "Blocked",
    "visual_merch_integration":    "Blocked",
    "rolling_red_count":           "Blocked",
    "weekly_hg_drift_alerts":      "Blocked",
    "fine_mix_trending":           "Blocked",
    # Backlog — P1/P2 with no deps
    "part_time_productivity":      "Backlog",
    "configurable_thresholds":     "Backlog",
}

_REVENUE_TIER_MAP: dict[str, str] = {
    # Large ≥$250K sourced
    "tx_level_payment_tags":       "Large",    # $378K fleet GC recycling
    "tx_level_attribution":        "Large",    # $2.37M attribution gap
    "tx_level_fine_per_associate": "Large",    # $274K fleet fine opportunity
    # Medium $50K-$250K or named cohort with defensible estimate
    "coverage_gap_diagnostic":     "Medium",   # 20 Coverage Gap stores — diagnosis determines lever
    "multi_factor_attribution":    "Medium",   # 18 High Gap stores → specifically actionable
    # Everything else — real but unquantified
}

_STATUS_ORDER = {"Ready": 0, "In-Progress": 1, "Blocked": 2, "Backlog": 3, "Shipped": 4}


def enrich(item: dict[str, Any]) -> dict[str, Any]:
    """Return item with status + revenue_impact_tier added."""
    return {
        **item,
        "status": _STATUS_MAP.get(item["id"], "Backlog"),
        "revenue_impact_tier": _REVENUE_TIER_MAP.get(item["id"], "Unsized"),
    }


def get_all_enriched(
    sort: str = "priority",
) -> list[dict[str, Any]]:
    """Flat list of all catalog items, enriched. sort='priority' or 'status'."""
    items = [enrich(i) for i in CATALOG]
    if sort == "status":
        items.sort(key=lambda i: (
            _STATUS_ORDER.get(i["status"], 99),
            _PRIORITY_ORDER.get(i["priority"], 99),
            _EFFORT_ORDER.get(i["effort"], 99),
        ))
    else:
        items.sort(key=_sort_key)
    return items


def get_board() -> dict[str, list[dict[str, Any]]]:
    """Kanban board: items grouped by status, each group sorted P0→P1→P2 then S→M→L."""
    groups: dict[str, list[dict[str, Any]]] = {
        "Ready": [],
        "In-Progress": [],
        "Blocked": [],
        "Backlog": [],
        "Shipped": [],
    }
    for item in CATALOG:
        enriched = enrich(item)
        groups[enriched["status"]].append(enriched)
    for group in groups.values():
        group.sort(key=_sort_key)
    return {"status_groups": groups}
