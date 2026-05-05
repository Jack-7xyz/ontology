"""Fine Revenue — mechanic #6.

Per-store fine-jewelry penetration classified into 5 quadrants via a 2-axis
cut at ±1σ on Mix σ (z-score of fine mix %) × AOV σ (z-score of fine AOV).
Each quadrant maps to a specific coaching lever:

  High+High   (green)   Top Fine Store         — celebrate + replicate playbook
  High+Low    (yellow)  Upsell Opportunity     — volume but low price point
  Low+High    (yellow)  Attach Rate Gap        — premium but rare
  Low+Low     (red)     Coaching Priority      — intervene
  Mid         (neutral) Steady fleet           — monitor

Fine jewelry is half the business — $5.07M of $10.50M net (48.3% fleet mix).
Fleet is tightly clustered, so small coaching interventions at outlier stores
have outsized impact. The 2D quadrant separates two failure modes that look
identical on fine mix % alone:
  - Naperville-style (Low+Low): associates aren't presenting fine — coaching
  - Seaport-style   (High+Low): associates ARE selling fine, at entry-level
    prices — shift product mix upward, not attach rate.

Compute reuses `bi.fine_mix_intel.compute(conn)` 1:1 — single source of
truth across Fine Mix Intelligence (BI dashboard) and this mechanic. Every
σ calculation, every quadrant rule, every opportunity $ lives in
fine_mix_intel.

Source-of-truth notes
---------------------
- Deck `s_m6_insights` + `s_m6_table` (scripts/append_mechanic_slides.py:
  274-287, 409-428) — 4 insight bullets + 5-row quadrant table ported
  verbatim. Counts come from live compute.
- Compute reuses fine_mix_intel.compute — no σ re-derivation.
- Weaknesses — 10-item DRAFT; stub in mechanics-algo-weaknesses.md §Mechanic #6
  pending Jack's QA + append.
- Improvements catalog: 4 entries live (bi/improvements.py:426-535) —
  tx_level_fine_per_associate · fine_mix_trending · associate_fine_coaching
  · visual_merch_integration.
"""

from __future__ import annotations

from typing import Any

from ..bi import fine_mix_intel


# --- Zone definitions ---------------------------------------------------------
#
# 5 zones correspond 1:1 to the `quadrant` values in fine_mix_intel.compute().
# The fine_flag cascade maps High+High → "Top Fine Store", etc. — but the
# quadrant itself is the diagram axis geometry. Zones live in cascade
# severity order (Coaching Priority first so red lands at the top of bucket
# lists and summary strips).

_ZONE_DEFS: list[dict[str, Any]] = [
    {
        "key":         "low_low",
        "label":       "Low+Low",
        "fine_flag":   "Coaching Priority",
        "severity":    "red",
        "criteria":    "Mix σ <−1 AND AOV σ <−1",
        "description": "Both mix and AOV below −1σ. Associates aren't "
                       "presenting fine in transactions (attach rate gap) AND "
                       "the fine pieces that do sell are entry-level. "
                       "Clearest coaching target.",
        "action":      "Coach attach rate + presentation. Clear playbook is "
                       "Top Fine Store cohort at same traffic tier.",
    },
    {
        "key":         "low_high",
        "label":       "Low+High",
        "fine_flag":   "Attach Rate Gap",
        "severity":    "yellow",
        "criteria":    "Mix σ <−1 AND AOV σ >+1",
        "description": "Low mix but high AOV — premium fine pieces sell, but "
                       "rarely. Customers who DO buy fine buy at a high price "
                       "point; associates aren't presenting fine in most "
                       "transactions.",
        "action":      "Train attach-rate behavior. Product mix is fine; the "
                       "gap is that fine isn't offered often enough.",
    },
    {
        "key":         "high_low",
        "label":       "High+Low",
        "fine_flag":   "Upsell Opportunity",
        "severity":    "yellow",
        "criteria":    "Mix σ >+1 AND AOV σ <−1",
        "description": "High mix but low AOV — associates ARE selling fine, "
                       "but at entry-level prices. Volume without price "
                       "point. Seaport is the canonical example.",
        "action":      "Shift product mix upward — higher-ticket fine "
                       "displays, price-point training. Attach behavior is "
                       "fine; the gap is price point.",
    },
    {
        "key":         "high_high",
        "label":       "High+High",
        "fine_flag":   "Top Fine Store",
        "severity":    "green",
        "criteria":    "Mix σ >+1 AND AOV σ >+1",
        "description": "Both mix and AOV above +1σ. Premium fine performer "
                       "with a replicable playbook. Recognition surface, not "
                       "just triage.",
        "action":      "Recognize + reverse-engineer. Training material "
                       "source for Low+Low + adjacent-tier coaching.",
    },
    {
        "key":         "mid",
        "label":       "Mid",
        "fine_flag":   "(steady)",
        "severity":    "green",
        "criteria":    "|Mix σ| ≤1 OR |AOV σ| ≤1",
        "description": "Everything inside ±1σ on either axis. Steady fleet — "
                       "most stores. Monitor drift; not a current action "
                       "target.",
        "action":      "Monitor. Consecutive-month drift toward Low+Low "
                       "triggers coaching (Ontology Improvement: fine_mix_"
                       "trending).",
    },
]

_LABEL_TO_KEY: dict[str, str] = {z["label"]: z["key"] for z in _ZONE_DEFS}


META: dict[str, Any] = {
    "id": "fine_rev",
    "label": "Fine Revenue Estimation",
    "deck_hook": (
        "Fine jewelry is half the business — $5.07M of $10.50M net (48.3% "
        "fleet mix). The 2D quadrant (Mix σ × AOV σ) separates two failure "
        "modes that look identical on fine-mix alone: Naperville-style "
        "(Low+Low, coach attach rate) vs Seaport-style (High+Low, shift "
        "product mix upward). One chart, two distinct coaching levers."
    ),
    "description": (
        "Per-store 2D classification of fine-jewelry performance — Mix σ "
        "(z-score of fine mix %) on one axis, AOV σ (z-score of fine AOV) "
        "on the other. Cuts at ±1σ produce 5 zones: Top Fine Store (High+"
        "High) for recognition, Upsell Opportunity (High+Low), Attach Rate "
        "Gap (Low+High), Coaching Priority (Low+Low), and Mid. Each zone "
        "maps to a specific management action. Click any store to drill "
        "into Fine Mix Intelligence anchored on the row."
    ),
    "upstream_bi": ["fine_mix_intel"],
    "utility": (
        "One 2D chart tells the VP which stores need attach-rate coaching "
        "(Low+High), which need product-mix upshift (High+Low), which are "
        "flat-out struggling (Low+Low), and which to replicate (High+High). "
        "Without the quadrant, Naperville (21% mix) and Seaport (high mix, "
        "low AOV) both look like 'fine problem stores' — but they need "
        "opposite interventions. The 2D separation is what makes coaching "
        "targeted vs generic."
    ),
    "logic_overview": (
        "For each store: compute Fine Mix % (fine_net / net) and Fine AOV "
        "(fine_net / fine_units). Z-score each against the fleet: Mix σ = "
        "(fine_mix_pct − fleet_avg_mix) / fleet_sd_mix; AOV σ similarly. "
        "Assign zone by cuts at ±1σ on both axes: High+High / High+Low / "
        "Low+High / Low+Low / Mid. Opportunity $ = (fleet_avg_mix × net) − "
        "fine_net (positive = under-indexing). Fine Flag cascade attaches a "
        "single action label per zone, matching the sheet's T column. Same "
        "σ calculation, same cuts, same Opportunity $ formula as the Fine "
        "Mix Intelligence dashboard — one source of truth."
    ),
    # Deck s_m6_insights bullets (append_mechanic_slides.py:274-287) — live
    # Jan-2026 fleet numbers from compute. Bullet 5 extends from compute
    # (zone counts) to give a concrete distribution snapshot on landing.
    "key_insights": [
        "Fleet: $5.07M fine net / $10.50M net = 48.3% fine mix — fine "
        "jewelry is half the business, not a niche category. Fleet median "
        "48.9% mix, $415 Fine AOV. Tightly clustered distribution, so "
        "outlier stores move real dollars.",
        "$274K total positive opportunity across stores below fleet-average "
        "mix. Concentrated in a small, identifiable tail — not distributed. "
        "Action list is short: coach the 4 Low+Low stores, replicate the 3 "
        "Top Fine Stores, monitor the rest.",
        "Park City: worst visual score in the fleet (3.0) but highest Fine "
        "AOV ($1,122), 66.3% mix, AOV σ +5.4 — the single strongest fine "
        "performer. Visual compliance has zero predictive power on fine "
        "revenue. Coaching and attach behavior drive fine sales, not case "
        "layout.",
        "Naperville: clearest Coaching Priority. 21.0% mix, 8% attach rate "
        "(vs fleet median 15%), $10K opportunity. Lowest on both axes → "
        "Low+Low quadrant. Same store also has the HG Processor case in "
        "Associate Performance (Staff 237 +85.4pp refund) — two different "
        "failure modes at one location.",
        "Zone distribution: High+High 3 · High+Low 1 · Low+High 0 · "
        "Low+Low 4 · Mid 112. 115 of 120 stores are Mid or better "
        "(112 Mid + 3 High+High). The 2D cut isolates ~7% of the fleet "
        "as the specific coaching + recognition list; the remaining 93% "
        "don't need an intervention.",
    ],
    # 5 rows — verbatim from deck s_m6_table (append_mechanic_slides.py:
    # 409-428). Columns remapped to Domain / Metric / G / Y / R / Reasoning
    # for the MechanicPage AlgorithmsTable. Counts + actions come from
    # _ZONE_DEFS; reasoning extends deck with the Ontology Improvement "why".
    "algorithms": [
        {
            "domain":    "High+High",
            "metric":    "Mix σ >+1 AND AOV σ >+1",
            "green":     "MATCH",
            "yellow":    "—",
            "red":       "—",
            "reasoning": "Top Fine Store — celebrate + replicate. Both mix "
                         "and AOV above +1σ = premium fine performer. "
                         "Bishop Ranch, Brentwood, Park City fire this "
                         "zone. Recognition surface, not just triage.",
        },
        {
            "domain":    "High+Low",
            "metric":    "Mix σ >+1 AND AOV σ <−1",
            "green":     "—",
            "yellow":    "MATCH",
            "red":       "—",
            "reasoning": "Upsell Opportunity — volume but low price point. "
                         "Associates ARE selling fine; the gap is price "
                         "point, not attach behavior. Shift product mix "
                         "upward, don't re-coach attach rate. Seaport is "
                         "the canonical example.",
        },
        {
            "domain":    "Low+High",
            "metric":    "Mix σ <−1 AND AOV σ >+1",
            "green":     "—",
            "yellow":    "MATCH",
            "red":       "—",
            "reasoning": "Attach Rate Gap — premium but rare. Customers who "
                         "DO buy fine pay high AOV, but most transactions "
                         "don't include fine at all. Train attach-rate "
                         "behavior, not product mix. Zero stores currently.",
        },
        {
            "domain":    "Low+Low",
            "metric":    "Mix σ <−1 AND AOV σ <−1",
            "green":     "—",
            "yellow":    "—",
            "red":       "MATCH",
            "reasoning": "Coaching Priority — intervene. Both axes below −1σ "
                         "= associates aren't presenting fine AND what sells "
                         "is entry-level. Birmingham, Baybrook, Naperville, "
                         "Southampton. Clearest coaching target.",
        },
        {
            "domain":    "Mid",
            "metric":    "|Mix σ| ≤1 OR |AOV σ| ≤1",
            "green":     "MATCH",
            "yellow":    "—",
            "red":       "—",
            "reasoning": "Steady fleet (112 stores) — inside ±1σ on at least "
                         "one axis. Monitor for consecutive-month drift "
                         "toward Low+Low (Ontology Improvement: fine_mix_"
                         "trending). Not a current action target.",
        },
    ],
    # 10 weaknesses — DRAFT. Drafted from deck Est Fine Rev footer caveat +
    # fine_mix_intel takeaways + improvements catalog entries (tx_level_
    # fine_per_associate, fine_mix_trending, associate_fine_coaching,
    # visual_merch_integration).
    "weaknesses": [
        {
            "rule":   "Est Fine Rev is store-level proxy, not measured. "
                      "fine_units × store_fine_aov credits an associate "
                      "who sold one $3K ring and one $200 earring at the "
                      "$415 store average for both. Park City's $1,122 AOV "
                      "masks individual associate selling patterns entirely.",
            "v2_fix": "Transaction-level price per fine unit at ingest. "
                      "Per-associate fine revenue becomes measured, not "
                      "estimated. Associate Performance cols L + M become "
                      "truthful.",
        },
        {
            "rule":   "Quadrant is a single-month snapshot. A store trending "
                      "from Mid toward Low+Low is invisible until it "
                      "arrives. Naperville's 21% mix might be declining or "
                      "recovering; a point estimate can't tell.",
            "v2_fix": "Weekly fine-mix trajectory per store + trend-line "
                      "drift detection. Dropping 2pp/month for 3 "
                      "consecutive months triggers alert before Low+Low "
                      "classification lands.",
        },
        {
            "rule":   "±1σ cuts are symmetric but fine distribution isn't. "
                      "Mix % is approximately normal across the fleet; "
                      "Fine AOV is right-skewed (Park City +5.4σ pulls the "
                      "tail). Symmetric cuts over-penalize Low+Low and "
                      "under-recognize the High+High long tail.",
            "v2_fix": "Percentile cuts instead of σ cuts (P15/P85), or "
                      "asymmetric σ bands that acknowledge skew. "
                      "Self-calibrates to cohort distribution shape.",
        },
        {
            "rule":   "Quadrant stops at the store level. Naperville's 8% "
                      "attach rate is a store metric — invisibility on "
                      "which associates are or aren't presenting fine. Two "
                      "associates at 15% and three at 3% aggregate to the "
                      "same store number as five at 8% uniformly.",
            "v2_fix": "Per-associate fine-units + individual attach rates; "
                      "coaching target narrows from 'the store' to 'the "
                      "three associates'. Depends on tx_level_fine_per_"
                      "associate shipping first.",
        },
        {
            "rule":   "Fleet σ is recomputed from the same set it's scoring. "
                      "If a single store's Fine AOV shifts materially, it "
                      "pulls the whole fleet's fleet_avg_aov, rescaling "
                      "every other store's σ. Jan → Feb Park City regress "
                      "would push multiple stores from Mid to High+Low.",
            "v2_fix": "Trailing-3-month or YTD fleet baseline for σ "
                      "normalization; snapshot baselines smooth monthly "
                      "rescaling distortions.",
        },
        {
            "rule":   "Visual Score carries no predictive value — Park City "
                      "proves this (worst visual, best Fine AOV). But the "
                      "mechanic offers no cross-domain explanation for WHY "
                      "Park City sells fine. Current data stops at "
                      "correlation, not causation.",
            "v2_fix": "Cross-domain semantic layer — fine_mix × visual_"
                      "photos × inventory_depth × promo_calendar × shift "
                      "patterns. Make Park City's playbook explainable and "
                      "replicable, not just observed.",
        },
        {
            "rule":   "Opportunity $ compares to fleet-average mix, not to "
                      "a cohort-relative target. Naperville's $10K "
                      "opportunity assumes it should perform at the fleet "
                      "avg, but Naperville's traffic + customer profile may "
                      "bound its achievable mix below fleet avg. Generic "
                      "opportunity number.",
            "v2_fix": "Traffic-tier + format-matched peer target. Mall-"
                      "anchor Naperville compares to mall-anchor peers; "
                      "the $10K becomes realistic + coaching-actionable.",
        },
        {
            "rule":   "Low+High bucket is empty (0 stores Jan 2026). That "
                      "either means the pattern genuinely doesn't occur, or "
                      "the σ cuts are too loose to isolate it. No way to "
                      "tell from a single snapshot whether it's signal or "
                      "geometry.",
            "v2_fix": "Multi-month backfill — if Low+High remains empty "
                      "across 6 months the geometry is wrong; if it "
                      "populates sporadically the zone is valid and the "
                      "monthly data just catches it rarely.",
        },
        {
            "rule":   "Store-level Fine AOV (K col) drops stores with zero "
                      "fine sellers — they can't land in any quadrant "
                      "(AOV σ blank). Those stores fall to Mid by default "
                      "regardless of their actual fine performance "
                      "(zero = the worst fine performance, functionally).",
            "v2_fix": "Explicit 'No Fine Sellers' bucket separate from "
                      "Mid. Surface as a different triage category — "
                      "hiring/staffing problem, not performance problem.",
        },
        {
            "rule":   "Fine Flag cascade is tied 1:1 to quadrant — single "
                      "label per store, hides co-occurring signals. A "
                      "Low+Low store might also have a Fine Seller "
                      "Concentration problem (<30% of associates selling "
                      "any fine) AND a trending-down signal AND a training-"
                      "cohort issue. The flag flattens them.",
            "v2_fix": "Multi-factor fine diagnostic — concentration + trend "
                      "+ zone + cohort surfaced in parallel, ranked by "
                      "dollar impact. Replaces single-label cascade with "
                      "contribution list.",
        },
    ],
    # Diagram spec — Quadrant2D: x = mix_sigma, y = aov_sigma. Cuts at ±1σ
    # produce 5 zones. Click store → Fine Mix Intelligence anchored on row.
    "diagram": {
        "kind": "quadrant_2d",
        "spec": {
            "x_field":       "mix_sigma",
            "y_field":       "aov_sigma",
            "x_label":       "Mix σ",
            "y_label":       "AOV σ",
            "cut":           1.0,
            "click_through": {
                "target_view":  "bi",
                "target_id":    "fine_mix_intel",
                "anchor_field": "store",
            },
        },
    },
    "takeaways": [
        "Fine jewelry is half the business — 48.3% fleet mix, $5.07M of "
        "$10.50M net. Not a niche category; it's the revenue engine. Fleet "
        "is tightly clustered so small coaching interventions at outlier "
        "stores move real dollars. $274K total positive opportunity.",
        "The 2D quadrant separates two failure modes that look identical "
        "on fine-mix alone. Naperville (Low+Low) → coach attach rate. "
        "Seaport (High+Low) → shift product mix upward. Same 'fine problem' "
        "diagnosis, opposite coaching prescriptions. Without the 2D cut, "
        "both get the same generic intervention.",
        "Park City kills the 'fix the displays' theory — worst visual "
        "compliance (3.0), highest Fine AOV ($1,122), +5.4σ. Visual score "
        "has zero predictive power on fine revenue. Coaching and attach "
        "behavior drive fine sales, not case layout. Cross-domain "
        "causation (v2) would explain the Park City playbook; today the "
        "data stops at the correlation.",
        "v1 single-month quadrant + σ cuts + store-level AOV proxy — clean "
        "for VP scan, coarse for coaching. v2 transaction-level fine "
        "revenue per associate + weekly trending + cohort-matched "
        "opportunity + explicit 'no fine sellers' bucket. Each lever is a "
        "specific improvement-catalog entry (see Ontology Improvements).",
    ],
    "source_notes": (
        "Insights and 5-row quadrant table verbatim from deck "
        "scripts/append_mechanic_slides.py s_m6_insights (:274-287) + "
        "s_m6_table (:409-428). Counts + σ + zone classification from live "
        "fine_mix_intel.compute (Pass 2 fleet stats → σ → quadrant → "
        "Fine Flag cascade). Weaknesses DRAFT pending append to notes/"
        "mechanics-algo-weaknesses.md §Mechanic #6. Compute is a 1:1 "
        "reuse of fine_mix_intel.compute — no σ or zone re-derivation; "
        "this mechanic is a presentation + drill-into-BI projection of "
        "the same underlying per-store data."
    ),
}


def compute(conn) -> dict:
    """Build the per-store Quadrant2D scatter data + zone aggregates + fleet.

    Returns:
        {
          rows: [
            {store, traffic_tier, fine_mix_pct, fine_aov, mix_sigma,
             aov_sigma, quadrant, quadrant_key, fine_flag, fine_seller_pct,
             opportunity_d, fine_units, staff_count, net_sales,
             fine_net_sales, visual_score},
            ...  (120 rows, sorted fine_mix_pct desc, Nones last)
          ],
          zones: [
            {key, label, fine_flag, count, severity, example_stores,
             criteria, description, ontology_fix},
            ...  (5 zones — coaching priority first)
          ],
          fleet: {
            total_stores, fleet_fine_net_d, fleet_net_d, fleet_mix_pct,
            fleet_avg_mix_pct, fleet_avg_fine_aov, total_opportunity_d,
            top_fine_store_count, coaching_priority_count,
            upsell_opportunity_count, attach_rate_gap_count, mid_count,
            dropped_no_fine_sellers,
          },
          thresholds: {sigma_cut: 1.0},
        }

    Reuses bi.fine_mix_intel.compute(conn) 1:1 — all σ / quadrant / flag
    logic lives there. This module projects the per-store rows into a
    quadrant-scatter shape + aggregates the 5 zones for the flowchart-
    style summary.
    """
    fmi = fine_mix_intel.compute(conn)
    fmi_rows = fmi["rows"]

    # --- Per-store rows -------------------------------------------------------
    # Keep every store (including blank-σ). The Quadrant2D diagram plots only
    # rows with both σ non-null; BiTable filter click-through works regardless.
    out_rows: list[dict] = []
    dropped_no_fine_sellers = 0
    for r in fmi_rows:
        mix_s = r.get("mix_sigma")
        aov_s = r.get("aov_sigma")
        if mix_s is None or aov_s is None:
            dropped_no_fine_sellers += 1
        quadrant = r.get("quadrant")  # "High+High" / ... / "Mid" / None
        out_rows.append({
            "store":            r.get("store"),
            "traffic_tier":     r.get("traffic_tier"),
            "fine_mix_pct":     r.get("fine_mix_pct"),
            "fine_aov":         r.get("fine_aov"),
            "mix_sigma":        mix_s,
            "aov_sigma":        aov_s,
            "quadrant":         quadrant,
            "quadrant_key":     _LABEL_TO_KEY.get(quadrant, None),
            "fine_flag":        r.get("fine_flag"),
            "fine_seller_pct":  r.get("fine_seller_pct"),
            "opportunity_d":    r.get("opportunity_d"),
            "fine_units":       r.get("fine_units"),
            "staff_count":      r.get("staff_count"),
            "net_sales":        r.get("net_sales"),
            "fine_net_sales":   r.get("fine_net_sales"),
            "visual_score":     r.get("visual_score"),
        })

    # Sort: quadrant priority (red→yellow→green→mid→none), then opportunity_d
    # desc within zone so the biggest coaching wins land on top of any filter.
    _severity_order = {"red": 0, "yellow": 1, "green": 2}
    _zone_by_label = {z["label"]: z for z in _ZONE_DEFS}
    def _row_sort_key(r: dict) -> tuple:
        q = r.get("quadrant")
        z = _zone_by_label.get(q or "", {})
        sev = _severity_order.get(z.get("severity", "green"), 3)
        # Mid lives at the tail of the colored zones
        is_mid = 1 if q == "Mid" else 0
        # None lives at the very tail
        has_q = 0 if q else 1
        return (has_q, is_mid, sev, -(r.get("opportunity_d") or 0))
    out_rows.sort(key=_row_sort_key)

    # --- Zone aggregates + example stores -------------------------------------
    rows_by_q: dict[str, list[dict]] = {z["label"]: [] for z in _ZONE_DEFS}
    for r in out_rows:
        lst = rows_by_q.get(r.get("quadrant") or "")
        if lst is not None:
            lst.append(r)

    # Example signal: for coaching/recognition zones, pick extreme-σ stores;
    # for Mid, pick largest opportunity so the deck-spotlight names land.
    def _example_signal(label: str, r: dict) -> float:
        ms = r.get("mix_sigma") or 0
        avs = r.get("aov_sigma") or 0
        if label == "High+High":
            return -(ms + avs)  # largest positive sum
        if label == "Low+Low":
            return ms + avs      # most negative sum (ascending)
        if label == "High+Low":
            return -(ms - avs)   # largest Mix − AOV (positive)
        if label == "Low+High":
            return ms - avs       # most negative Mix − AOV
        # Mid
        return -(r.get("opportunity_d") or 0)

    zones: list[dict] = []
    for z in _ZONE_DEFS:
        in_zone = rows_by_q.get(z["label"], [])
        ex_sorted = sorted(in_zone, key=lambda r: _example_signal(z["label"], r))
        example_stores = [r["store"] for r in ex_sorted[:3] if r.get("store")]

        zones.append({
            "key":            z["key"],
            "label":          z["label"],
            "fine_flag":      z["fine_flag"],
            "count":          len(in_zone),
            "severity":       z["severity"],
            "example_stores": example_stores,
            "criteria":       z["criteria"],
            "description":    z["description"],
            "ontology_fix":      z["action"],
        })

    # --- Fleet aggregates -----------------------------------------------------
    fleet_fine_net = sum(
        r["fine_net_sales"] for r in out_rows if r.get("fine_net_sales") is not None
    )
    fleet_net = sum(
        r["net_sales"] for r in out_rows if r.get("net_sales") is not None
    )
    fleet_mix_pct = (fleet_fine_net / fleet_net) if fleet_net else None

    mix_vals = [r["fine_mix_pct"] for r in out_rows if r.get("fine_mix_pct") is not None]
    aov_vals = [r["fine_aov"]     for r in out_rows if r.get("fine_aov")     is not None]
    fleet_avg_mix_pct = sum(mix_vals) / len(mix_vals) if mix_vals else None
    fleet_avg_fine_aov = sum(aov_vals) / len(aov_vals) if aov_vals else None

    total_opportunity_d = sum(
        r["opportunity_d"] for r in out_rows
        if r.get("opportunity_d") is not None and r["opportunity_d"] > 0
    )

    q_counts = {z["label"]: len(rows_by_q.get(z["label"], [])) for z in _ZONE_DEFS}

    fleet = {
        "total_stores":             len(out_rows),
        "fleet_fine_net_d":         fleet_fine_net,
        "fleet_net_d":              fleet_net,
        "fleet_mix_pct":            fleet_mix_pct,
        "fleet_avg_mix_pct":        fleet_avg_mix_pct,
        "fleet_avg_fine_aov":       fleet_avg_fine_aov,
        "total_opportunity_d":      total_opportunity_d,
        "top_fine_store_count":     q_counts.get("High+High", 0),
        "coaching_priority_count":  q_counts.get("Low+Low", 0),
        "upsell_opportunity_count": q_counts.get("High+Low", 0),
        "attach_rate_gap_count":    q_counts.get("Low+High", 0),
        "mid_count":                q_counts.get("Mid", 0),
        "dropped_no_fine_sellers":  dropped_no_fine_sellers,
    }

    thresholds = {"sigma_cut": 1.0}

    return {
        "rows":       out_rows,
        "zones":      zones,
        "fleet":      fleet,
        "thresholds": thresholds,
    }
