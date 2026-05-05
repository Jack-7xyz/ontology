"""Fine Mix Intelligence — fine-jewelry penetration by store with quadrant + 5-flag cascade.

Source-of-truth: canonical Google Sheet "Fine Mix Intelligence" tab (gid=1124938962).
  120 stores, 20 cols A-T. Column order mirrors sheet exactly.
  Reference builder: scripts/build_fine_mix_intelligence.py.

Framing (mechanics-reference.md Mechanic 6):
  Fine jewelry is half the business — $5.07M of $10.50M net (48.3% fleet mix).
  This isn't a niche category; it's the revenue engine. Fleet is tightly clustered
  around the median (48.9% mix, $415 Fine AOV) — small coaching interventions at
  outlier stores have outsized impact. The dashboard surfaces:
    - Top Fine Stores to celebrate + replicate (High+High quadrant)
    - Coaching Priority stores (Low+Low) — short, identifiable tail
    - Upsell Opportunities (High mix, Low AOV — volume without price point)
    - Attach Rate Gaps (High AOV, Low mix — premium but rare)

Fine Mix % and Fine AOV themselves carry NO G/Y/R — they are signal, not
compliance. The G/Y/R lives on Attach Rate (percentile, behavior signal),
Fine Seller % (threshold, concentration signal), Visual Score, Mix σ, AOV σ,
Quadrant, and Fine Flag.

Columns (sheet A-T)
-------------------
  A Store              — raw   (Store+.store_location)
  B Traffic Tier       — tab+  (Store+.traffic_tier)
  C Staff Count        — bi+   (COUNTIF Staff Hours+.location == store)
  D Gross Sales        — raw   (Store+.this_month_gross_sales)
  E Net Sales          — tab+  (Store+.net_sales)
  F Store AOV          — tab+  (Store+.aov)
  G Fine Net Sales     — raw   (Store+.this_month_fine_net_sales)
  H Fine Mix %         — tab+  (Store+.fine_mix_pct)                   [NO G/Y/R]
  I Fine Units         — bi+   (SUMPRODUCT Staff+.fine_units_sold by location)
  J Fine Attach Rate   — bi+   (Fine Units / Σ Staff+.qty_sold by store)  [percentile]
  K Fine AOV           — bi+   (Fine Net / Fine Units)                 [NO G/Y/R]
  L Opportunity $      — bi+   (fleet_avg_mix × Net Sales) − Fine Net
  M Fine Sellers       — bi+   (count Staff+ at store with fine_units > 0)
  N Fine Seller %      — bi+   (M / C)                                  [threshold]
  O Visual Score       — tab+  (Visual+.visual_score, INDEX/MATCH)      [threshold]
  P YoY Growth         — tab+  (Store+.yoy_growth)
  Q Mix σ              — bi+   z-score of Fine Mix %                    [threshold]
  R AOV σ              — bi+   z-score of Fine AOV                      [threshold]
  S Quadrant           — bi+   5-way from (Mix σ, AOV σ) cuts at ±1     [categorical]
  T Fine Flag          — bi+   5-flag cascade off Quadrant + Seller %   [categorical]

Flag rules
----------
  J Fine Attach Rate — percentile higher=better, P33/P67
                       G >P67 · Y P33-P67 · R <P33
  N Fine Seller %    — threshold fall-through higher=better
                       G >70% · Y 30-70% · R <30%
  O Visual Score     — threshold fall-through lower=better (1=best, 3=worst)
                       G <1.5 · Y 1.5-2.4 · R ≥2.5
  Q Mix σ / R AOV σ  — threshold fall-through higher=better
                       G >1 · Y −1 to 1 · R <−1
  S Quadrant         — categorical: High+High→G · Low+Low→R · others→None
  T Fine Flag        — categorical: Top Fine Store→G · Coaching Priority→R · others→None

5-flag cascade (order is load-bearing — first match wins, mirrors sheet T col)
------------------------------------------------------------------------------
  1. Top Fine Store           Quadrant == High+High                (green)
  2. Upsell Opportunity       Quadrant == High+Low                  (yellow)
  3. Attach Rate Gap          Quadrant == Low+High                  (yellow)
  4. Coaching Priority        Quadrant == Low+Low                   (red)
  5. Fine Seller Concentration  Seller% <30% AND Mix < fleet_avg    (yellow)
  6. (blank)                  default                               (none)

Quadrant cuts (S col, sheet formula)
------------------------------------
  High+High: Mix σ >1 AND AOV σ >1
  High+Low : Mix σ >1 AND AOV σ <−1
  Low+High : Mix σ <−1 AND AOV σ >1
  Low+Low  : Mix σ <−1 AND AOV σ <−1
  Mid      : everything else (including |σ| ≤ 1 on either axis)

Shared helper
-------------
  compute_store_fine_aov(conn) — module-level, returns {store_lower_key: fine_aov}
  where fine_aov = Store+.this_month_fine_net_sales / Σ Staff+.fine_units_sold at store.
  Mirrors sheet col K. Used by Associate Performance cols L (est_fine_rev) +
  M (fine_rev_pct) once that backfill ships. Same pattern as
  ops_compliance.compute_red_count_and_domains.

Data caveats (verified in DB + sheet — unmatched / undefined → blank, mirrors IFERROR)
---------------------------------------------------------------------------
  - Case-insensitive store join via _k(s)=s.lower() — same pattern as
    attribution_intel + associate_perf. "Shops around Lenox" (Staff Hours+) vs
    "Shops Around Lenox" (Store+) would otherwise mismatch on Fine Units +
    Fine Sellers aggregations.
  - Los Gatos (2 associates) + Rockingham Park (1) live in Staff Hours+ but
    have NO Store+ row → no Fine Mix Intelligence row exists for them
    (driver loop is over Store+, mirroring the sheet). These associates'
    fine_units don't roll up anywhere — source-data gap, not a join bug.
  - Visual+ has 119 rows (one store missing). That store shows Visual Score
    blank (mirrors sheet IFERROR INDEX/MATCH).
  - Mix σ / AOV σ: stores with H or K = None drop from fleet stats and
    from σ output (mirrors sheet IF(H="","")). Fleet mean ≈ 0, sd ≈ 1 by construction.
  - Fine AOV (K) = None when Fine Units = 0 (no fine sellers), mirrors
    sheet IFERROR. These stores cannot land in any quadrant (AOV σ blank → Mid).
  - Pure-refund associates (e.g. Staff #184 at Shops around Lenox, gross=$0
    with negative refunds) contribute fine_units_sold normally; no exclusion
    needed — fine_units is unit count, not revenue.
"""

from __future__ import annotations

import math
from typing import Any

from .. import plus as plus_registry


# ---------- cascade / quadrant mappings (single source of truth) ----------

QUADRANT_COLORS: dict[str, str] = {
    "High+High": "green",
    "Low+Low":   "red",
    # High+Low / Low+High / Mid → no color (signal only)
}

FINE_FLAG_COLORS: dict[str, str] = {
    "Top Fine Store":             "green",
    "Coaching Priority":          "red",
    "Upsell Opportunity":         "yellow",
    "Attach Rate Gap":            "yellow",
    "Fine Seller Concentration":  "yellow",
    # blank → no color
}


# ---------- shared helper (used by associate_perf cols L + M backfill) ----------

def compute_store_fine_aov(conn) -> dict[str, float]:
    """Return {store_lowercase_key: fine_aov} where fine_aov =
    Store+.this_month_fine_net_sales / Σ Staff+.fine_units_sold at store.

    Mirrors Fine Mix Intelligence col K. Used by both this module's K column
    AND by bi/associate_perf.py cols L (est_fine_rev) + M (fine_rev_pct) to
    produce per-associate fine revenue estimates. Same shared-helper pattern
    as ops_compliance.compute_red_count_and_domains.

    Stores with Fine Units = 0 (no fine sellers) are omitted from the dict
    (caller should treat absence as None — mirrors sheet IFERROR).
    """
    store_rows       = plus_registry.compute("store", conn)
    staff_rows       = plus_registry.compute("staff", conn)
    staff_hours_rows = plus_registry.compute("staff_hours", conn)

    def _k(s: str | None) -> str | None:
        return s.lower() if isinstance(s, str) else None

    staff_by_id: dict[str, dict] = {}
    for s in staff_rows:
        sid = s.get("name")
        if sid is not None:
            staff_by_id[str(sid)] = s

    fine_units_by_loc: dict[str, float] = {}
    for sh in staff_hours_rows:
        k = _k(sh.get("location"))
        if k is None:
            continue
        s = staff_by_id.get(str(sh.get("staff"))) or {}
        fu = s.get("fine_units_sold")
        if fu is not None:
            fine_units_by_loc[k] = fine_units_by_loc.get(k, 0.0) + float(fu)

    out: dict[str, float] = {}
    for st in store_rows:
        k = _k(st.get("store_location"))
        if k is None:
            continue
        fine_net = st.get("this_month_fine_net_sales")
        fine_units = fine_units_by_loc.get(k, 0.0)
        if fine_net is None or fine_units <= 0:
            continue
        out[k] = float(fine_net) / fine_units
    return out


META: dict[str, Any] = {
    "id": "fine_mix_intel",
    "label": "Fine Mix Intelligence",
    "description": (
        "Fine jewelry penetration by store: mix %, attach rate, AOV, opportunity sizing, "
        "seller concentration, and 5-way quadrant classification. Mix and AOV sigma are "
        "z-scores (distance from fleet mean in standard deviations). Fine Flag provides "
        "actionable triage per store — Top Fine Store / Upsell Opportunity / Attach Rate "
        "Gap / Coaching Priority / Fine Seller Concentration. Fine Mix % and Fine AOV "
        "themselves carry no G/Y/R — they are signal, not compliance."
    ),
    "upstream_plus": ["store", "staff", "staff_hours", "visual"],
    "takeaways": [
        "$274K in untapped fine opportunity — concentrated in a small, "
        "identifiable tail, not distributed across the fleet. Only 4 stores "
        "land in Low+Low quadrant (both mix and AOV below −1σ): Birmingham, "
        "Baybrook, Naperville, Southampton. 115 of 120 stores are Mid or "
        "better (112 Mid + 3 High+High). Action list: coach 4, replicate "
        "3, monitor the rest.",
        "Fine jewelry is half the business — $5.07M of $10.50M net (48.3% "
        "fleet mix). Not a niche category; it's the revenue engine. Fleet is "
        "tightly clustered (median 48.9% mix, $415 Fine AOV) so small coaching "
        "interventions at outlier stores move real dollars across 120 "
        "locations.",
        "3 Top Fine Stores (High+High quadrant): Bishop Ranch, Brentwood, "
        "Park City. Both mix and AOV above +1σ — premium fine performers with "
        "replicable playbooks. Recognition surface, not just triage.",
        "Park City contradicts the \"fix the displays\" theory. Worst visual "
        "compliance in the fleet (3.0) but highest Fine AOV ($1,122), 66.3% "
        "mix, AOV σ +5.4 — the single strongest fine performer. Visual "
        "compliance has zero predictive power on fine revenue. Coaching and "
        "attach behavior drive fine sales, not case layout.",
        "Naperville — the clearest coaching target. 21.0% mix, 8% attach rate "
        "(vs fleet median 15%), $10K opportunity. Lowest on both dimensions. "
        "Attach rate gap = associates aren't presenting fine in transactions "
        "(trainable behavior, not a market problem). Same store also shows "
        "the Naperville Staff 237 HG Processor case in Associate Performance "
        "— two different failure modes at one location.",
        "Seaport is the sole High+Low (Upsell Opportunity) — high fine mix "
        "volume but low price point. Coaching lever differs from Low+Low: "
        "associates ARE selling fine, but at entry-level prices. Shift "
        "product mix upward, not attach rate.",
        "Fine Mix % and Fine AOV carry no G/Y/R — they're signal, not "
        "compliance. Color lives on Attach Rate (behavior), Fine Seller % "
        "(concentration), Visual, and the Mix σ / AOV σ / Quadrant / Fine "
        "Flag triage stack. Not every number needs a traffic light.",
        "Store-level Fine AOV is a proxy (est_fine_rev = fine_units × "
        "store_fine_aov). An associate who sells one $3K ring and one $200 "
        "pair of earrings is credited at the store average for both. Park "
        "City's $1,122 AOV masks individual associate selling patterns. "
        "Transaction-level fine revenue per associate shifts coaching from "
        "\"sell more fine\" to a concrete price-point comparison against the "
        "top performer.",
        "Data caveats: Visual+ has 119 of 120 stores (one missing → blank "
        "Visual Score). Los Gatos (2 associates) + Rockingham Park (1) have "
        "no Store+ row — no Fine Mix row exists for them; their fine_units "
        "don't roll up anywhere. Source-data gap, not a join bug — same "
        "caveat set that surfaces in Attribution Intel and Associate "
        "Performance.",
    ],
    "columns": [
        # ---- A-C: Identity ----
        {"name": "store", "tier": "raw", "type": "TEXT", "formula": None,
         "description": "Location name (Store+).",
         "flag_rule": None},
        {"name": "traffic_tier", "tier": "tab_derived", "type": "TEXT",
         "formula": "Store+.traffic_tier (High/Med/Low by percentile)",
         "description": "Tertile rank by traffic. Context only — no G/Y/R.",
         "flag_rule": None},
        {"name": "staff_count", "tier": "bi_derived", "type": "INTEGER",
         "formula": "COUNTIF(Staff Hours+.location == store)",
         "description": "Associates at this location (count of Staff Hours+ rows).",
         "flag_rule": None},

        # ---- D-F: Revenue Context ----
        {"name": "gross_sales", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Total gross sales, Jan 2026 (Store+.this_month_gross_sales).",
         "flag_rule": None},
        {"name": "net_sales", "tier": "tab_derived", "type": "REAL",
         "formula": "Gross + Discounts + Returns (Store+.net_sales)",
         "description": "Net sales after discounts and returns.",
         "flag_rule": None},
        {"name": "store_aov", "tier": "tab_derived", "type": "REAL",
         "formula": "Gross Sales / Orders (Store+.aov, store-level)",
         "description": "Store-level AOV. Context for Fine AOV comparison.",
         "flag_rule": None},

        # ---- G-L: Fine Detail ----
        {"name": "fine_net_sales", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Fine category net sales (Store+.this_month_fine_net_sales).",
         "flag_rule": None},
        {"name": "fine_mix_pct", "tier": "tab_derived", "type": "REAL",
         "formula": "fine_net_sales / net_sales (Store+.fine_mix_pct)",
         "description": "Fine Net / Net Sales — product mix signal. No G/Y/R (not "
                        "compliance). Color lives on the σ / Quadrant / Flag triage stack.",
         "flag_rule": None},
        {"name": "fine_units", "tier": "bi_derived", "type": "INTEGER",
         "formula": "SUMPRODUCT(Staff+.fine_units_sold where Staff Hours+.location == store)",
         "description": "Fine jewelry units sold at this location. Case-insensitive store "
                        "join — Los Gatos + Rockingham Park associates' units don't roll up "
                        "(source-data gap; no Store+ row exists for those locations).",
         "flag_rule": None},
        {"name": "fine_attach_rate", "tier": "bi_derived", "type": "REAL",
         "formula": "fine_units / Σ Staff+.qty_sold by store",
         "description": "Fine Units / Total QTY Sold — unit-based mix. Behavior signal "
                        "(are associates presenting fine in the transaction?). Percentile-"
                        "flagged because attach rate is fleet-relative — what's good at a "
                        "low-traffic store differs from a flagship.",
         "flag_rule": {
             "kind": "percentile",
             "direction": "higher_is_better",
             "cut_low": 0.33, "cut_high": 0.67,
             "legend": "green >P67 · yellow P33-P67 · red <P33",
             "rationale": "Fleet-relative because attach rate scales with store format and "
                          "customer mix. Naperville (8%) is the clearest coaching target — "
                          "below P33 means associates aren't presenting fine in transactions "
                          "(trainable behavior), not that customers are rejecting it.",
         }},
        {"name": "fine_aov", "tier": "bi_derived", "type": "REAL",
         "formula": "fine_net_sales / fine_units (net-based, per piece)",
         "description": "Average price point of fine pieces sold. No G/Y/R (signal, not "
                        "compliance). Park City's $1,122 Fine AOV is the fleet leader — "
                        "high price-point coaching success, not a number to triage.",
         "flag_rule": None},
        {"name": "opportunity_d", "tier": "bi_derived", "type": "REAL",
         "formula": "(fleet_avg_fine_mix_pct × net_sales) − fine_net_sales",
         "description": "Dollar gap to fleet-average fine mix. Positive = under-indexing "
                        "(opportunity to lift). Negative = over-indexing (already above "
                        "fleet avg). Naperville $10K opportunity = clearest coaching target.",
         "flag_rule": None},

        # ---- M-N: Associate Context ----
        {"name": "fine_sellers", "tier": "bi_derived", "type": "INTEGER",
         "formula": "Count of Staff+ at store with fine_units_sold > 0",
         "description": "Associates who sold ≥1 fine unit. Counterpart to Fine Seller % "
                        "concentration check.",
         "flag_rule": None},
        {"name": "fine_seller_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "fine_sellers / staff_count",
         "description": "Share of associates who sold fine. <30% means fine concentrated in "
                        "a small subset — replication risk if those sellers leave.",
         "flag_rule": {
             "kind": "threshold",
             # Fall-through: green >70%, yellow 30-70%, red <30%.
             "bands": [
                 {"color": "green",  "op": ">",  "value": 0.70},
                 {"color": "yellow", "op": ">=", "value": 0.30},
                 {"color": "red",    "op": "<",  "value": 0.30},
             ],
             "legend": "green >70% · yellow 30-70% · red <30%",
             "rationale": "<30% = fine revenue depends on a handful of associates — single-"
                          "point-of-failure risk for the store's fine mix. >70% = broad-based "
                          "fine selling culture (replicable). 30-70% = monitor for drift.",
         }},

        # ---- O-P: Cross-Refs ----
        {"name": "visual_score", "tier": "tab_derived", "type": "REAL",
         "formula": "Visual+.visual_score (INDEX/MATCH by store)",
         "description": "Composite floorset audit score (1=best, 3=worst). Visual+ has 119 "
                        "of 120 stores — one missing → blank (mirrors sheet IFERROR).",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<",  "value": 1.5},
                 {"color": "yellow", "op": "<=", "value": 2.4},
                 {"color": "red",    "op": ">=", "value": 2.5},
             ],
             "legend": "green <1.5 · yellow 1.5-2.4 · red ≥2.5",
             "rationale": "Cross-ref check — Park City's worst visual (3.0) coexists with "
                          "highest Fine AOV ($1,122) and Top Fine Store flag, killing the "
                          "'fix the displays' theory. Color preserved for compliance, not "
                          "as a fine-revenue predictor.",
         }},
        {"name": "yoy_growth", "tier": "tab_derived", "type": "REAL",
         "formula": "(this_month - LY) / LY  (Store+.yoy_growth)",
         "description": "Year-over-year gross sales growth. Blank for new stores without a "
                        "comp-LY baseline. Context only — no G/Y/R.",
         "flag_rule": None},

        # ---- Q-T: Statistical + Triage ----
        {"name": "mix_sigma", "tier": "bi_derived", "type": "REAL",
         "formula": "(fine_mix_pct − fleet_avg_mix) / fleet_sd_mix  (z-score)",
         "description": "Z-score of Fine Mix % vs fleet. >1 = high (top of distribution), "
                        "<−1 = low (bottom). Feeds Quadrant. Fleet mean ≈ 0, sd ≈ 1 by "
                        "construction.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": ">",  "value": 1.0},
                 {"color": "yellow", "op": "between", "value": [-1.0, 1.0]},
                 {"color": "red",    "op": "<",  "value": -1.0},
             ],
             "legend": "green >1σ · yellow ±1σ · red <−1σ",
             "rationale": "Sheet-locked z-score thresholds — top 16% of fleet (>+1σ) is the "
                          "Top Fine Store quadrant axis; bottom 16% (<−1σ) is the Coaching "
                          "Priority axis. Symmetric cuts because fine mix distribution is "
                          "approximately normal across the fleet.",
         }},
        {"name": "aov_sigma", "tier": "bi_derived", "type": "REAL",
         "formula": "(fine_aov − fleet_avg_aov) / fleet_sd_aov  (z-score)",
         "description": "Z-score of Fine AOV vs fleet. >1 = high price point, <−1 = low. "
                        "Feeds Quadrant. Stores with no fine units → blank.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": ">",  "value": 1.0},
                 {"color": "yellow", "op": "between", "value": [-1.0, 1.0]},
                 {"color": "red",    "op": "<",  "value": -1.0},
             ],
             "legend": "green >1σ · yellow ±1σ · red <−1σ",
             "rationale": "Same symmetric z-score logic as Mix σ. Park City's +5.4 AOV σ is "
                          "the fleet outlier (high price-point fine selling). Bethesda's +3.2 "
                          "is structural (2 associates, $843 Fine AOV — tiny store, premium mix).",
         }},
        {"name": "quadrant", "tier": "bi_derived", "type": "TEXT",
         "formula": "5-way: High+High / High+Low / Low+High / Low+Low / Mid (cuts at ±1σ)",
         "description": "Composite of Mix σ + AOV σ. High+High = top fine performer "
                        "(celebrate); Low+Low = coaching priority (intervene); High+Low = "
                        "volume but low price (upsell); Low+High = premium but rare "
                        "(attach rate gap); Mid = everything inside ±1σ on either axis.",
         "flag_rule": {
             "kind": "categorical",
             "mapping": QUADRANT_COLORS,
             "legend": "High+High → green · Low+Low → red · others → none",
             "rationale": "Only the corner quadrants get color — they're the action list. "
                          "Mid (112 of 120 stores) is the steady fleet; High+Low / Low+High "
                          "are surfaced via Fine Flag (yellow) but no quadrant color, "
                          "matching sheet conditional formatting exactly.",
         }},
        {"name": "fine_flag", "tier": "bi_derived", "type": "TEXT",
         "formula": (
             "Cascade (first match wins): "
             "1. Top Fine Store (Quadrant=High+High) · "
             "2. Upsell Opportunity (Quadrant=High+Low) · "
             "3. Attach Rate Gap (Quadrant=Low+High) · "
             "4. Coaching Priority (Quadrant=Low+Low) · "
             "5. Fine Seller Concentration (Seller% <30% AND Mix < fleet avg) · "
             "6. (blank)"
         ),
         "description": "Single triage label per store. Cascade is load-bearing — quadrant "
                        "labels fire first (4 most-actionable cohorts), then Concentration "
                        "catches stores with healthy mix but fragile seller base. Counts "
                        "(Jan 2026): 3 Top Fine · 1 Upsell · 0 Attach Gap · 4 Coaching · "
                        "~0 Concentration · 112 blank.",
         "flag_rule": {
             "kind": "categorical",
             "mapping": FINE_FLAG_COLORS,
             "legend": "Top Fine Store→G · Coaching Priority→R · Upsell/Attach Gap/Concentration→Y",
             "rationale": "Color follows action urgency: Top Fine (green, replicate), "
                          "Coaching Priority (red, intervene), Upsell/Attach Gap (yellow, "
                          "targeted opportunity), Concentration (yellow, monitor for "
                          "single-point-of-failure risk).",
         }},
    ],
}


def compute(conn) -> dict:
    store_rows       = plus_registry.compute("store", conn)
    staff_rows       = plus_registry.compute("staff", conn)
    staff_hours_rows = plus_registry.compute("staff_hours", conn)
    visual_rows      = plus_registry.compute("visual", conn)

    # Case-insensitive store join — mirrors sheet MATCH (see attribution_intel.py:278).
    def _k(s: str | None) -> str | None:
        return s.lower() if isinstance(s, str) else None

    # --- Indexes -----------------------------------------------------------

    staff_by_id: dict[str, dict] = {}
    for s in staff_rows:
        sid = s.get("name")
        if sid is not None:
            staff_by_id[str(sid)] = s

    # Per-store aggregates from Staff Hours+ × Staff+ join.
    staff_count_by_loc: dict[str, int] = {}
    fine_units_by_loc: dict[str, float] = {}
    qty_sold_by_loc: dict[str, float] = {}
    fine_sellers_by_loc: dict[str, int] = {}
    for sh in staff_hours_rows:
        k = _k(sh.get("location"))
        if k is None:
            continue
        staff_count_by_loc[k] = staff_count_by_loc.get(k, 0) + 1
        s = staff_by_id.get(str(sh.get("staff"))) or {}
        fu = s.get("fine_units_sold")
        if fu is not None:
            fine_units_by_loc[k] = fine_units_by_loc.get(k, 0.0) + float(fu)
            if float(fu) > 0:
                fine_sellers_by_loc[k] = fine_sellers_by_loc.get(k, 0) + 1
        qty = s.get("qty_sold")
        if qty is not None:
            qty_sold_by_loc[k] = qty_sold_by_loc.get(k, 0.0) + float(qty)

    # Visual+ first-row-wins per store (mirrors INDEX/MATCH).
    visual_by_loc: dict[str, float] = {}
    for v in visual_rows:
        k = _k(v.get("store_location"))
        if k is None or k in visual_by_loc:
            continue
        vs = v.get("visual_score")
        if vs is not None:
            try:
                visual_by_loc[k] = float(vs)
            except (TypeError, ValueError):
                pass

    # --- Pass 1: per-store raw + derived (without σ / quadrant / flag) ----

    rows: list[dict] = []
    for st in store_rows:
        loc = st.get("store_location")
        k = _k(loc)
        gross    = st.get("this_month_gross_sales")
        net      = st.get("net_sales")
        store_aov = st.get("aov")
        fine_net = st.get("this_month_fine_net_sales")
        fine_mix = st.get("fine_mix_pct")
        yoy      = st.get("yoy_growth")

        staff_ct  = staff_count_by_loc.get(k, 0) if k else 0
        fine_units = fine_units_by_loc.get(k, 0.0) if k else 0.0
        qty_total  = qty_sold_by_loc.get(k, 0.0) if k else 0.0
        fine_sellers = fine_sellers_by_loc.get(k, 0) if k else 0

        # J: Fine Attach Rate — Fine Units / Total QTY by store
        attach_rate = (fine_units / qty_total) if qty_total > 0 else None

        # K: Fine AOV — Fine Net / Fine Units (None when no fine units)
        fine_aov = (float(fine_net) / fine_units) if (fine_net is not None and fine_units > 0) else None

        # N: Fine Seller % — Fine Sellers / Staff Count
        seller_pct = (fine_sellers / staff_ct) if staff_ct > 0 else None

        # Cast units/sellers to int for clean display
        fine_units_int = int(fine_units) if fine_units == fine_units else 0  # NaN guard

        rows.append({
            "store":             loc,
            "traffic_tier":      _title_tier(st.get("traffic_tier")),
            "staff_count":       staff_ct,
            "gross_sales":       gross,
            "net_sales":         net,
            "store_aov":         store_aov,
            "fine_net_sales":    fine_net,
            "fine_mix_pct":      fine_mix,
            "fine_units":        fine_units_int,
            "fine_attach_rate":  attach_rate,
            "fine_aov":          fine_aov,
            "opportunity_d":     None,  # filled pass 2 (needs fleet avg mix)
            "fine_sellers":      fine_sellers,
            "fine_seller_pct":   seller_pct,
            "visual_score":      visual_by_loc.get(k) if k else None,
            "yoy_growth":        yoy,
            "mix_sigma":         None,  # pass 2
            "aov_sigma":         None,  # pass 2
            "quadrant":          None,  # pass 2
            "fine_flag":         None,  # pass 2
        })

    # --- Pass 2: fleet stats → σ, quadrant, opportunity, cascade -----------

    mix_vals = [r["fine_mix_pct"] for r in rows if r["fine_mix_pct"] is not None]
    aov_vals = [r["fine_aov"]     for r in rows if r["fine_aov"]     is not None]

    fleet_avg_mix = sum(mix_vals) / len(mix_vals) if mix_vals else None
    fleet_avg_aov = sum(aov_vals) / len(aov_vals) if aov_vals else None

    # Sample standard deviation (n-1) — matches Google Sheets STDEV().
    def _sd(vals: list[float], mean: float | None) -> float | None:
        if mean is None or len(vals) < 2:
            return None
        var = sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)
        return math.sqrt(var)

    fleet_sd_mix = _sd(mix_vals, fleet_avg_mix)
    fleet_sd_aov = _sd(aov_vals, fleet_avg_aov)

    for r in rows:
        # L: Opportunity $ — (fleet avg mix × net) − fine_net
        net = r["net_sales"]
        fine_net = r["fine_net_sales"]
        if fleet_avg_mix is not None and net is not None and fine_net is not None:
            r["opportunity_d"] = fleet_avg_mix * net - fine_net

        # Q: Mix σ
        mix = r["fine_mix_pct"]
        if mix is not None and fleet_sd_mix not in (None, 0):
            r["mix_sigma"] = (mix - fleet_avg_mix) / fleet_sd_mix

        # R: AOV σ
        aov = r["fine_aov"]
        if aov is not None and fleet_sd_aov not in (None, 0):
            r["aov_sigma"] = (aov - fleet_avg_aov) / fleet_sd_aov

        # S: Quadrant — sheet formula, only fires when both σ present
        ms, av = r["mix_sigma"], r["aov_sigma"]
        if ms is None or av is None:
            r["quadrant"] = None
        elif ms > 1 and av > 1:
            r["quadrant"] = "High+High"
        elif ms > 1 and av < -1:
            r["quadrant"] = "High+Low"
        elif ms < -1 and av > 1:
            r["quadrant"] = "Low+High"
        elif ms < -1 and av < -1:
            r["quadrant"] = "Low+Low"
        else:
            r["quadrant"] = "Mid"

        # T: Fine Flag — cascade (first match wins). Mirrors sheet T formula.
        q = r["quadrant"]
        if q == "High+High":
            r["fine_flag"] = "Top Fine Store"
        elif q == "High+Low":
            r["fine_flag"] = "Upsell Opportunity"
        elif q == "Low+High":
            r["fine_flag"] = "Attach Rate Gap"
        elif q == "Low+Low":
            r["fine_flag"] = "Coaching Priority"
        elif (
            r["fine_seller_pct"] is not None
            and r["fine_seller_pct"] < 0.30
            and mix is not None
            and fleet_avg_mix is not None
            and mix < fleet_avg_mix
        ):
            r["fine_flag"] = "Fine Seller Concentration"
        else:
            r["fine_flag"] = ""

    # Sort by Fine Mix % DESC, Nones last (matches sheet display).
    rows.sort(key=lambda r: (r["fine_mix_pct"] is None, -(r["fine_mix_pct"] or 0)))

    # --- Per-cell flag colors ----------------------------------------------

    from . import compute_flags_for_column
    flag_matrix: list[dict[str, str | None]] = [{} for _ in rows]
    for col in META["columns"]:
        rule = col.get("flag_rule")
        if rule is None or rule.get("kind") in ("none", "mirror"):
            continue
        colors = compute_flags_for_column(col["name"], rule, rows)
        for i, color in enumerate(colors):
            flag_matrix[i][col["name"]] = color

    return {"rows": rows, "flags": flag_matrix}


def _title_tier(t: Any) -> Any:
    """Store+.traffic_tier comes through lowercase — match sheet display casing."""
    return t.title() if isinstance(t, str) else t
