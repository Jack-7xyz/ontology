"""Associate Performance — per-associate productivity + HG Processor detection + Perf Flag cascade.

Source-of-truth: canonical Google Sheet "Associate Performance" tab (gid=112561431).
  601 associates, 23 cols A-W. All 23 cols now live; cols L (Est Fine Rev) + M
  (Fine Rev %) use the shared `compute_store_fine_aov` helper from
  `bi.fine_mix_intel` — same source-of-truth-helper pattern as Store Intel's
  `compute_red_count_and_domains` import from ops_compliance.

Framing (mechanics-reference.md Mechanic 4):
  HG Processor flags associates "whose primary function is processing HG returns" —
  "Separates HG behavior from genuine underperformance so the VP doesn't coach
  the wrong problem. They aren't underperformers, they're doing a different job."
  HG Processors get reassigned, not disciplined — the classification exists so
  productivity metrics aren't misread for associates doing a materially different
  role ($5K gross floor filters noise; their gross is higher because they ring up
  both sides of the gift-card cycle).

Store-relative throughout — Sales/Hour vs own store Rev/LH, Refund Rate vs own
store Return Rate. Fleet averages would flag a $200/hr associate as "above
average" at a $150/hr store and "below average" at a $400/hr store; store-relative
preserves meaning across the fleet.

Flag rules
----------
  Sales/Hour (O)       — mirrors S/Hr vs Store (P) color
  S/Hr vs Store (P)    — threshold on ratio: green ≥1.0, yellow 0.60-1.0, red <0.60
  Refund Rate (Q)      — mirrors Refund vs Store (R) color
  Refund vs Store (R)  — threshold on pp delta: green ≤0, yellow 0-10pp, red >10pp
  HG Processor (U)     — categorical: YES → red
  HG Risk Score (V)    — threshold: green =0, yellow =1, red ≥2
  Performance Flag (W) — no coloring (categorical label only; see takeaways)

Cross-BI helpers imported
-------------------------
  `compute_store_fine_aov(conn) -> {store_lower: fine_aov}` from `fine_mix_intel` —
  drives cols L (est_fine_rev = fine_units × store_fine_aov) + M (fine_rev_pct =
  est_fine_rev / gross_sales). One source of truth for Store Fine AOV, reused by
  both Fine-Mix BI col K and this module. Stores without fine sellers return None
  (associate rows at those stores show blank L/M — mirrors sheet IFERROR).

Data caveats (verified in DB + sheet — unmatched associates fall through as blank,
which mirrors the sheet's IFERROR wrappers)
--------
  - **Los Gatos (2 associates) + Rockingham Park (1 associate)** — staff_hours
    `location` values that have no corresponding row in Store+. These 3 associates
    show blank for store-relative cols (s_hr_vs_store, refund_vs_store, traffic_tier,
    hg_risk_score) and fall through Perf Flag cascade as Standard. Source-data gap,
    not a join bug.
  - **Case-normalization in effect**: staff_hours ("Shops around Lenox") vs
    Store+ ("Shops Around Lenox") case-diff resolved via lower-case key match —
    mirrors Google Sheets' case-insensitive MATCH. Without it, 4 Shops-around-Lenox
    associates would also fall through unmatched.
  - **Associate 184 (Shops around Lenox)**: gross=$0 with −$270 refund activity
    (net-negative; pure returns, no sales). refund_rate divides-by-zero → blank;
    refund_vs_store also blank. Likely a terminated stylist processing trailing
    refunds. One-row edge, documented for completeness.
"""

from __future__ import annotations

from typing import Any

from .. import plus as plus_registry
from .fine_mix_intel import compute_store_fine_aov


META: dict[str, Any] = {
    "id": "associate_perf",
    "label": "Associate Performance",
    "description": "Individual associate productivity with store-relative efficiency metrics "
                   "and HG Processor detection. Drill-down companion to Store Intelligence — "
                   "filter by Store for store-level investigation. Store-relative throughout: "
                   "Sales/Hour benchmarked against the associate's own store Rev/LH, Refund Rate "
                   "against the store's Return Rate.",
    "upstream_plus": ["staff", "staff_hours", "hg", "store"],
    "takeaways": [
        "104 of 601 associates (17.3%) flagged — each flag maps to a specific "
        "management action. HG Processors (63) get reassigned, not disciplined. "
        "Low Productivity (14) get coached. High Refunds (18) get investigated. "
        "Top Performers (9) get recognized. Remaining 497 are within store "
        "norms — no noise.",
        "Naperville Staff 237 — 123% refund rate (processing more returns than "
        "own sales), in a store with 37.5% return rate and 52.4% staff aggregate "
        "refund rate. Designated HG return processor, doing their job. A naive "
        "alert system would put them on a 2-week notice; the HG Processor flag "
        "catches this automatically — reassign, don't discipline.",
        "HG Processors caught first by design (63 of 104 flagged, 61% of "
        "flagged pool). Without this filter, refund-rate review would wrongly "
        "flag 63 associates for disciplinary action. The cascade removes them "
        "before any performance evaluation runs — they aren't underperformers, "
        "they're doing a different job.",
        "14 genuine underperformers across 120 stores after all filters apply. "
        "100-hour minimum excludes part-timers. HG Processor exclusion removes "
        "false positives. Store-relative threshold removes fleet distortion. "
        "What's left is surgically precise and immediately actionable — the "
        "real coaching list.",
        "Traffic tier normalization keeps the dashboard fair across the fleet. "
        "Aspen (786 traffic): a stylist selling $50K is performing. Orlando "
        "(5,777 traffic): a stylist selling $50K is underperforming. Same "
        "dollar amount, opposite reads. Fleet-wide benchmarks are meaningless "
        "here; store-relative is mandatory.",
        "Store-relative thresholds keep every drill-down coherent. A $200/hr "
        "associate is Low Productivity at a $400/hr store (50% of store RLH) "
        "and Top Performer at a $150/hr store (133%). Fleet averages miss both. "
        "Every metric benchmarks against the associate's own store, so numbers "
        "stay consistent from Store Intel down to the individual row.",
        "$5K gross floor splits refund signal cleanly: >$5K high-refund = HG "
        "Processor (cycling gift cards — both sides of the transaction, which "
        "inflates gross); ≤$5K high-refund = High Refunds (low-volume noise "
        "or policy issue, needs investigation, not reassignment).",
        "Part-timer blind spot: the 100-hour minimum on Low Productivity "
        "excludes part-time associates — genuine part-time underperformers "
        "disappear into the 497 Standard pool unexamined. Rate-metric "
        "thresholds (Sales/Hour, AOV) with minimum-shift floors instead of "
        "cumulative hours would close the gap.",
        "Est Fine Rev (col L) + Fine Rev % (col M) wired via shared "
        "compute_store_fine_aov() helper from bi.fine_mix_intel — fine_units × "
        "store-level Fine AOV. Store-level proxy is the current data-model "
        "limit; transaction-level fine revenue per associate shifts coaching "
        "from \"sell more fine\" to a concrete price-point comparison against "
        "the top performer.",
        "Data caveat — 3 associates show blank store-relative cols: Los Gatos "
        "(2) + Rockingham Park (1) have no Store+ match (source-data gap, not "
        "a join bug). Associate 184 at Shops around Lenox has gross=$0 with "
        "−$270 refunds — divide-by-zero on refund_rate leaves refund_vs_store "
        "blank. Mirrors the sheet's IFERROR wrappers — unmatched / undefined "
        "→ blank, not a failure.",
    ],
    "columns": [
        # ---- Identity ----
        {"name": "staff_id", "tier": "raw", "type": "INTEGER", "formula": "Staff+.name",
         "description": "Associate identifier (numeric IDs).",
         "flag_rule": None},
        {"name": "store", "tier": "raw", "type": "TEXT", "formula": "Staff Hours+.location",
         "description": "Store location from hours log (authoritative for the associate's home store). "
                        "Case-insensitive lookup vs Store+ (mirrors sheet MATCH behavior). "
                        "Caveat: Los Gatos (2 associates) + Rockingham Park (1) have no Store+ "
                        "row — store-relative cols blank for these 3 rows.",
         "flag_rule": None},
        {"name": "title", "tier": "raw", "type": "TEXT", "formula": "Staff Hours+.title",
         "description": "Role: stylist or asm.",
         "flag_rule": None},

        # ---- P&L Waterfall ----
        {"name": "gross_sales", "tier": "raw", "type": "REAL", "formula": "Staff+.gross_sales",
         "description": "Total gross sales, Jan 2026.",
         "flag_rule": None},
        {"name": "discounts", "tier": "raw", "type": "REAL", "formula": "Staff+.discounts",
         "description": "Discount dollars applied (negative).",
         "flag_rule": None},
        {"name": "refunds", "tier": "raw", "type": "REAL", "formula": "Staff+.refunds",
         "description": "Refund dollars processed (negative).",
         "flag_rule": None},
        {"name": "net_sales", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales + discounts + refunds  (from Staff+)",
         "description": "Net sales after discounts and refunds.",
         "flag_rule": None},

        # ---- Units & Product Mix ----
        {"name": "orders", "tier": "raw", "type": "INTEGER", "formula": "Staff+.orders",
         "description": "Total orders placed.",
         "flag_rule": None},
        {"name": "qty_sold", "tier": "raw", "type": "INTEGER", "formula": "Staff+.qty_sold",
         "description": "Total units sold.",
         "flag_rule": None},
        {"name": "fine_units", "tier": "raw", "type": "INTEGER", "formula": "Staff+.fine_units_sold",
         "description": "Fine-jewelry units sold.",
         "flag_rule": None},
        {"name": "fine_unit_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "fine_units / qty_sold",
         "description": "Fine-jewelry share of units sold.",
         "flag_rule": None},
        {"name": "est_fine_rev", "tier": "bi_derived", "type": "REAL",
         "formula": "fine_units × store_fine_aov  (store_fine_aov from fine_mix_intel.compute_store_fine_aov)",
         "description": "Estimated fine revenue this associate contributed — fine units "
                        "times the store-level Fine AOV (store fine net / store fine units). "
                        "Blank when store has no fine sellers (Fine Units=0) or associate "
                        "store lookup fails (Los Gatos / Rockingham Park caveat).",
         "flag_rule": None},
        {"name": "fine_rev_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "est_fine_rev / gross_sales",
         "description": "Fine revenue as share of associate's gross. Product-mix signal at "
                        "the person level — complements fine_unit_pct (which is unit-based). "
                        "Blank when gross_sales=0 or est_fine_rev blank.",
         "flag_rule": None},

        # ---- Efficiency ----
        {"name": "aov", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales / orders  (from Staff+)",
         "description": "Average order value.",
         "flag_rule": None},
        {"name": "sales_per_hour", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales / hours_worked  (from Staff+)",
         "description": "Productivity — gross per hour. Color mirrors S/Hr vs Store — store-relative.",
         "flag_rule": {
             "kind": "mirror",
             "source": "s_hr_vs_store",
             "legend": "green ≥100% store RLH · yellow 60-100% · red <60% (via S/Hr vs Store)",
             "rationale": "Absolute $/hr doesn't translate across stores. Color comes from the "
                          "ratio column (S/Hr vs Store) — associate benchmarked against their own "
                          "store's Rev/LH, not fleet average.",
         }},
        {"name": "s_hr_vs_store", "tier": "bi_derived", "type": "REAL",
         "formula": "sales_per_hour / Store.rev_per_labor_hour",
         "description": "Associate's Sales/Hour ÷ their store's Rev/LH. Visible ratio so the VP "
                        "reads the number, not just the color.",
         "flag_rule": {
             "kind": "threshold",
             # Bands evaluated top-to-bottom, first match wins — use >= with fall-through
             # to eliminate edge gaps (e.g. 0.99999 would otherwise miss green and miss
             # a strict between band).
             "bands": [
                 {"color": "green",  "op": ">=", "value": 1.0},
                 {"color": "yellow", "op": ">=", "value": 0.60},
                 {"color": "red",    "op": "<",  "value": 0.60},
             ],
             "legend": "green ≥100% · yellow 60-100% · red <60%",
             "rationale": "100% = matching own store's productivity. <60% = genuine underperformer "
                          "(in concert with the 100-hour floor on the Low Productivity flag). "
                          "150% threshold for Top Performer fires further up (col W cascade).",
         }},
        {"name": "refund_rate", "tier": "tab_derived", "type": "REAL",
         "formula": "abs(refunds) / gross_sales  (from Staff+)",
         "description": "Magnitude of refunds over gross. Color mirrors Refund vs Store — store-relative.",
         "flag_rule": {
             "kind": "mirror",
             "source": "refund_vs_store",
             "legend": "green ≤store return rate · yellow to +10pp · red >+10pp (via Refund vs Store)",
             "rationale": "Absolute refund rate varies structurally by store (NYC vs TX). Color "
                          "comes from the pp-delta column — associate vs their store's baseline.",
         }},
        {"name": "refund_vs_store", "tier": "bi_derived", "type": "REAL",
         "formula": "refund_rate − Store.return_rate",
         "description": "Refund Rate minus the associate's store Return Rate. Positive = above "
                        "store baseline. Signed percentage: +X.X% / −X.X%.",
         "flag_rule": {
             "kind": "threshold",
             # Fall-through bands — green catches ≤0, yellow catches 0..0.10, red catches >0.10.
             # Avoids band gaps for tiny positive values (e.g. +0.0001pp).
             "bands": [
                 {"color": "green",  "op": "<=", "value": 0.0},
                 {"color": "yellow", "op": "<=", "value": 0.10},
                 {"color": "red",    "op": ">",  "value": 0.10},
             ],
             "legend": "green ≤0pp · yellow 0-10pp · red >10pp",
             "rationale": "Store-relative threshold — same +10pp cut used by HG Processor detection. "
                          "Consistent across the two metrics so the VP reads one rule, not two.",
         }},

        # ---- Context & Flags ----
        {"name": "hours", "tier": "raw", "type": "REAL", "formula": "Staff Hours+.hours",
         "description": "Total hours worked in the period.",
         "flag_rule": None},
        {"name": "traffic_tier", "tier": "bi_derived", "type": "TEXT",
         "formula": "lookup Store+.traffic_tier (High/Med/Low)",
         "description": "Store traffic tier (percentile-bucketed). No G/Y/R — context only.",
         "flag_rule": None},
        {"name": "hg_processor", "tier": "bi_derived", "type": "TEXT",
         "formula": 'YES if refund_rate > Store.return_rate + 10pp AND gross_sales > $5K else ""',
         "description": "Flags associates whose primary function is processing HG returns. "
                        "Separates HG behavior from genuine underperformance so the VP doesn't "
                        "coach the wrong problem — they aren't underperformers, they're doing a "
                        "different job. Reassign, don't discipline.",
         "flag_rule": {
             "kind": "categorical",
             "mapping": {"YES": "red"},
             "legend": "YES → red (HG Processor identified)",
             "rationale": "+10pp is the store-relative deviation that signals non-standard refund "
                          "behavior. $5K gross floor removes low-volume noise (part-timer with "
                          "2 txns and 1 refund = meaningless 50% rate). HG Processors actually "
                          "have *higher* gross — they ring up both sides of the gift-card cycle.",
         }},
        {"name": "hg_risk_score", "tier": "bi_derived", "type": "INTEGER",
         "formula": "lookup HG+.hg_risk_score (store-level, inherited)",
         "description": "Store-level HG risk (0-3) inherited by every associate at that store. "
                        "Context, not individual signal.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==", "value": 0},
                 {"color": "yellow", "op": "==", "value": 1},
                 {"color": "red",    "op": ">=", "value": 2},
             ],
             "legend": "green =0 · yellow =1 · red ≥2",
             "rationale": "HG+ composite (missing-units ratio, non-compliance, gift-card volume). "
                          "Per-store passthrough; associate context, not an individual metric.",
         }},
        {"name": "perf_flag", "tier": "bi_derived", "type": "TEXT",
         "formula": "Cascade (first match wins): "
                    "1. HG Processor (col U=YES) · "
                    "2. Low Productivity (s_hr_vs_store <0.60 AND hours >100) · "
                    "3. High Refunds (refund_vs_store >10pp AND gross ≤$5K) · "
                    "4. Top Performer (s_hr_vs_store ≥1.50) · "
                    "5. Standard (blank)",
         "description": "Single action label per associate. Cascade prevents double-counting. "
                        "No G/Y/R — categorical label only. Counts (Jan 2026): "
                        "~63 HG Processor · 14 Low Prod · 18 High Refunds · 9 Top Performer · 497 Standard.",
         "flag_rule": None},
    ],
}


def compute(conn) -> dict:
    staff_rows       = plus_registry.compute("staff", conn)
    staff_hours_rows = plus_registry.compute("staff_hours", conn)
    hg_rows          = plus_registry.compute("hg", conn)
    store_rows       = plus_registry.compute("store", conn)

    # Store-level Fine AOV from shared Fine-Mix helper (single source of truth for
    # store.fine_net_sales / Σ staff.fine_units_sold — drives cols L + M). Absence
    # from dict = store has no fine sellers → Nones downstream (mirrors sheet IFERROR).
    store_fine_aov = compute_store_fine_aov(conn)

    # --- Indexes -----------------------------------------------------------

    # Staff Hours+ keyed by associate id (numeric IDs — cast to string for stability).
    sh_by_id: dict[str, dict] = {}
    for sh in staff_hours_rows:
        sid = sh.get("staff")
        if sid is None:
            continue
        sh_by_id[str(sid)] = sh

    # Lookups are case-insensitive — staff_hours.location uses mixed case
    # (e.g. "Shops around Lenox") vs Store+.store_location ("Shops Around Lenox").
    # Sheet MATCH is case-insensitive by default; mirror that here.
    def _k(s: str | None) -> str | None:
        return s.lower() if isinstance(s, str) else None

    # Store+ keyed by store location — for return_rate and traffic_tier.
    store_by_loc: dict[str, dict] = {}
    for s in store_rows:
        loc = s.get("store_location")
        k = _k(loc)
        if k is not None:
            store_by_loc[k] = s

    # HG+ first-row-wins per store (matches sheet INDEX/MATCH behavior) for hg_risk_score.
    hg_risk_by_loc: dict[str, int] = {}
    for hg in hg_rows:
        k = _k(hg.get("store_location"))
        if k is None or k in hg_risk_by_loc:
            continue
        risk = hg.get("hg_risk_score")
        if risk is not None:
            hg_risk_by_loc[k] = int(risk)

    # Rev/Labor Hour per store = store gross / sum of staff hours at that store.
    # Inline (same formula as store_intel.py:243-246) — avoids BI→BI compute coupling.
    labor_hours_by_loc: dict[str, float] = {}
    for sh in staff_hours_rows:
        k = _k(sh.get("location"))
        h = sh.get("hours")
        if k is None or h is None:
            continue
        labor_hours_by_loc[k] = labor_hours_by_loc.get(k, 0.0) + float(h)

    rev_per_lh_by_loc: dict[str, float] = {}
    for s in store_rows:
        k = _k(s.get("store_location"))
        gross = s.get("this_month_gross_sales")
        hrs = labor_hours_by_loc.get(k) if k else None
        if k and gross is not None and hrs not in (None, 0):
            rev_per_lh_by_loc[k] = gross / hrs

    # --- Build associate rows ----------------------------------------------

    rows: list[dict] = []
    for st in staff_rows:
        sid = st.get("name")
        # Cast numeric associate IDs to int for clean display (source is REAL).
        sid_int = int(sid) if isinstance(sid, (int, float)) and sid == sid else sid
        sid_key = str(sid) if sid is not None else None
        sh = sh_by_id.get(sid_key, {}) if sid_key else {}

        store_loc = sh.get("location")
        store_key = _k(store_loc)
        store_plus_row = store_by_loc.get(store_key, {}) if store_key else {}
        store_return_rate = store_plus_row.get("return_rate")
        store_rev_lh = rev_per_lh_by_loc.get(store_key) if store_key else None

        gross   = st.get("gross_sales")
        refunds = st.get("refunds")
        orders  = st.get("orders")
        qty     = st.get("qty_sold")
        fine    = st.get("fine_units_sold")
        refund_rate = st.get("refund_rate")          # from Staff+
        sales_per_hour = st.get("sales_per_hour")    # from Staff+

        # fine_unit_pct (K) — bi-derived
        fine_unit_pct = (fine / qty) if (fine is not None and qty not in (None, 0)) else None

        # est_fine_rev (L) — shared store-level Fine AOV from fine_mix_intel helper.
        # None when fine units blank, store unmatched (Los Gatos / Rockingham Park),
        # or store has no fine sellers (helper omits those keys).
        store_fine_aov_val = store_fine_aov.get(store_key) if store_key else None
        est_fine_rev = (
            fine * store_fine_aov_val
            if (fine is not None and store_fine_aov_val is not None)
            else None
        )
        # fine_rev_pct (M) — est_fine_rev / gross. Blank when either is None or gross=0.
        fine_rev_pct = (
            est_fine_rev / gross
            if (est_fine_rev is not None and gross not in (None, 0))
            else None
        )

        # s_hr_vs_store (P) — ratio
        s_hr_vs_store = (
            sales_per_hour / store_rev_lh
            if (sales_per_hour is not None and store_rev_lh not in (None, 0))
            else None
        )

        # refund_vs_store (R) — pp delta
        refund_vs_store = (
            refund_rate - store_return_rate
            if (refund_rate is not None and store_return_rate is not None)
            else None
        )

        # HG Processor (U) — refund_vs_store > +10pp AND gross > $5K
        hg_proc = (
            "YES"
            if (refund_vs_store is not None and refund_vs_store > 0.10
                and gross is not None and gross > 5000)
            else ""
        )

        # Perf Flag (W) — cascade, first match wins
        hours_worked = sh.get("hours")
        perf_flag = ""
        if hg_proc == "YES":
            perf_flag = "HG Processor"
        elif (s_hr_vs_store is not None and s_hr_vs_store < 0.60
              and hours_worked is not None and hours_worked > 100):
            perf_flag = "Low Productivity"
        elif (refund_vs_store is not None and refund_vs_store > 0.10
              and gross is not None and gross <= 5000):
            perf_flag = "High Refunds"
        elif s_hr_vs_store is not None and s_hr_vs_store >= 1.50:
            perf_flag = "Top Performer"

        # Title-case traffic tier to match sheet display (Store+ returns lowercase).
        tt = store_plus_row.get("traffic_tier")
        traffic_tier = tt.title() if isinstance(tt, str) else tt

        rows.append({
            "staff_id":          sid_int,
            "store":             store_loc,
            "title":             sh.get("title"),
            "gross_sales":       gross,
            "discounts":         st.get("discounts"),
            "refunds":           refunds,
            "net_sales":         st.get("net_sales"),
            "orders":            orders,
            "qty_sold":          qty,
            "fine_units":        fine,
            "fine_unit_pct":     fine_unit_pct,
            "est_fine_rev":      est_fine_rev,
            "fine_rev_pct":      fine_rev_pct,
            "aov":               st.get("aov"),
            "sales_per_hour":    sales_per_hour,
            "s_hr_vs_store":     s_hr_vs_store,
            "refund_rate":       refund_rate,
            "refund_vs_store":   refund_vs_store,
            "hours":             hours_worked,
            "traffic_tier":      traffic_tier,
            "hg_processor":      hg_proc,
            "hg_risk_score":     hg_risk_by_loc.get(store_key) if store_key else None,
            "perf_flag":         perf_flag,
        })

    # Sort: Store asc → Gross Sales desc (matches sheet default).
    rows.sort(key=lambda r: ((r.get("store") or ""), -(r.get("gross_sales") or 0)))

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

    # Mirror overrides — sales_per_hour ← s_hr_vs_store; refund_rate ← refund_vs_store.
    for col in META["columns"]:
        rule = col.get("flag_rule")
        if rule and rule.get("kind") == "mirror":
            src = rule.get("source")
            host = col["name"]
            for i in range(len(rows)):
                flag_matrix[i][host] = flag_matrix[i].get(src)

    return {"rows": rows, "flags": flag_matrix}
