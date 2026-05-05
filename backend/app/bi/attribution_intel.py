"""Attribution Intelligence — store-to-staff revenue attribution gap with 7-flag cascade.

Source-of-truth: canonical Google Sheet "Attribution Intelligence" tab (gid=1215308107).
  120 stores, 15 cols A-O in sheet. Column order mirrors sheet exactly.
  Reference builder: scripts/build_attribution_intelligence.py.

Framing
-------
  Gap $ is a **data-quality signal, not a revenue miss**. The revenue already
  happened; what's broken is attribution — Store rang it, but no Staff did
  (POS transposition, missing associate login, multi-store associate attribution,
  HG gift-card recycling, etc). The dashboard classifies the root cause so the VP knows
  whether to fix POS config, staffing, refund ops, or HG dedup.

Columns (sheet A-O)
-------------------
  A Store              — raw   (Store+.store_location)
  B Traffic Tier       — tab+  (Store+.traffic_tier)
  C Staff Count        — bi+   (COUNTIF Staff Hours+.location == store)
  D Store Gross        — raw   (Store+.this_month_gross_sales)
  E Staff Gross        — bi+   (SUMPRODUCT Staff+.gross where SH+.location = store)
  F Gap %              — bi+   (Store Gross − Staff Gross) / Store Gross    [flagged abs]
  G Gap $              — bi+   (Store Gross − Staff Gross)
  H Traffic            — raw   (Store+.this_month_traffic)
  I Traffic / Staff    — bi+   Traffic / Staff Count                         [flagged %ile]
  J Est GC Revenue     — tab+  HG+.est_revenue_impact first-row-wins
  K GC % of Gap        — bi+   Est GC Rev / Gap $ (gated Gap$>0 AND GC>0)   [flagged thr]
  L Refund Gap $       — bi+   |Store.returns| − |Σ Staff.refunds by loc|
  M Refund % of Gap    — bi+   Refund Gap $ / Gap $ (gated Gap$>0)          [flagged thr]
  N Primary Flag       — bi+   7-flag cascade (first-match-wins)            [categorical]
  O Ontology Fix          — bi+   flag → fix mapping (empty if OK)

Flag rules
----------
  F Gap %           — threshold abs fall-through: G |x|<15% · Y |x|≤30% · R |x|>30%
  I Traffic/Staff   — percentile lower=better, cuts 0.33/0.75 (not 0.67)
                      G <P33 · Y P33–P75 · R >P75 (stretched coverage)
  K GC % of Gap     — threshold fall-through lower=better: G <25% · Y ≤50% · R >50%
  M Refund % of Gap — threshold fall-through lower=better: G <10% · Y ≤25% · R >25%
  N Primary Flag    — categorical: OK→G · Moderate/Reverse→Y · HG/Coverage/Refund/High→R

7-flag cascade (order is load-bearing — first match wins)
---------------------------------------------------------
  1. Reverse Gap    gap% < −2%                                      (yellow)
  2. HG-Driven      gc_pct > 50% AND gap$ > $5,000                  (red)
  3. Coverage Gap   t_per_s > P75 AND gap% > 15%                    (red)
  4. Refund-Driven  refund_pct > 25% AND refund$ > $3K AND gap%>15% (red)
  5. High Gap       gap% > 30%                                      (red)
  6. Moderate Gap   gap% > 15%                                      (yellow)
  7. OK             default                                         (green)

Data caveats
------------
  - Store Gross=0 guard: Gap %/$ computed as None when Store Gross is 0 or missing,
    mirroring sheet IF(D=0,""). No store in the current Jan-2026 snapshot actually
    hits this (Southampton = $15.4K gross); guard preserved for future snapshots.
  - Stores with gift_cards_generated=0 → Est GC Rev=0, K=None (gated). HG-Driven
    never fires for these — correct behavior.
  - Case-insensitive store join (same _k(s)=s.lower() pattern as Associate Perf) —
    Staff Hours+.location "Shops around Lenox" vs Store+.store_location
    "Shops Around Lenox" would otherwise mismatch for Staff Gross and Refund Gap.
  - Staff Gross via SUMPRODUCT semantics: associate must exist in both Staff+ AND
    Staff Hours+ to contribute. Los Gatos (2 associates, IDs 76 + 86) and
    Rockingham Park (1 associate, ID 470) have no Store+ row — both locations
    are invisible in the 120-store output entirely. Those 3 associates' gross
    is silently excluded from the dataset. Source-data gap.
  - HG+ first-row-wins per store mirrors sheet INDEX/MATCH (one row per store at
    Jan-2026 snapshot anyway).
"""

from __future__ import annotations

from typing import Any

from .. import plus as plus_registry


# ---------- cascade / fix mapping (single source of truth) ----------

FIX_MAP: dict[str, str] = {
    "Reverse Gap":   "Transaction-level per-store attribution",
    "HG-Driven":     "HG gift card dedup at order level",
    "Coverage Gap":  "Staffing gap alert + POS auto-assign",
    "Refund-Driven": "Refund attribution + return-location matching",
    "High Gap":      "POS config audit + compliance training flag",
    "Moderate Gap":  "Attribution monitoring + POS reconciliation",
    "OK":            "",
}

PRIMARY_FLAG_COLORS: dict[str, str] = {
    "OK":            "green",
    "Moderate Gap":  "yellow",
    "Reverse Gap":   "yellow",
    "HG-Driven":     "red",
    "Coverage Gap":  "red",
    "Refund-Driven": "red",
    "High Gap":      "red",
}


META: dict[str, Any] = {
    "id": "attribution_intel",
    "label": "Attribution Intelligence",
    "description": (
        "Store-to-staff revenue attribution gap by location. Gap $ is a data-quality "
        "signal, not a revenue miss — the revenue already happened; attribution is broken. "
        "7-flag cascade classifies root cause (Reverse Gap / HG-Driven / Coverage Gap / "
        "Refund-Driven / High Gap / Moderate Gap / OK) so the VP knows whether to fix POS "
        "config, staffing, refund ops, or HG dedup. Ontology Fix maps each flag to the "
        "automated ingest feature that resolves it."
    ),
    "upstream_plus": ["store", "staff", "staff_hours", "hg"],
    "takeaways": [
        "$2.37M in revenue has no associate's name on it — fleet-wide gap across "
        "83 of 120 stores (18.5% dollar-weighted). Gap is a data-quality signal, "
        "not a revenue miss: the revenue already happened; what's broken is "
        "attribution. Fix is dedup / config / staffing, not coaching.",
        "Bethesda — 59% true attribution gap, 2 staff, 1,510 visitors, T/S 755, "
        "$843 Fine AOV. Without the cascade this reads as a POS config problem; "
        "the cascade identifies it as a staffing-capacity constraint. Different "
        "diagnosis, different fix.",
        "Volume alone doesn't cause gaps — capacity does. The fleet's highest-traffic "
        "stores often have the best attribution. The driver is transactions-per-"
        "associate (Traffic/Staff), not foot traffic alone. Irvine Spectrum is the "
        "counter-example: #1 gross store ($512K), top Ontology Net, high T/S — "
        "attribution holds. Their flag is HG-Driven (GC revenue accounting), not "
        "Coverage Gap (badge scan behavior). When a Coverage Gap store says 'we "
        "can't scan at this volume,' Irvine says they can. That reframes 20 Coverage "
        "Gap stores as a coaching problem, not an infrastructure constraint. "
        "Fleet-relative P75 cut on T/S adapts to this retailer — shifts if fleet composition changes.",
        "One flag per store via first-match-wins cascade — 5 distinct root causes, "
        "each with a different fix. Counts: 20 Coverage Gap (staffing), 10 "
        "Refund-Driven, 18 High Gap (needs manual investigation), 29 Moderate Gap "
        "(monitoring), 3 HG-Driven, 3 Reverse Gap, 37 OK. Without the cascade, "
        "83 stores share one generic recommendation.",
        "Cascade order is load-bearing: structural (Reverse) → systemic (HG) → "
        "operational (Coverage, Refund) → severity-only (High/Moderate). Each "
        "layer peels off a known cause before falling to generic severity flags. "
        "Specific causes fire first so the row reads as root cause, not severity.",
        "Every flag maps to an Ontology Fix. Refund-Driven + HG-Driven are structural "
        "dedup wins (return-location matching + GC dedup at order level). Coverage "
        "Gap resolves via POS auto-assign + staffing capacity alerts — the largest "
        "actionable bucket at 20 stores. High Gap is explicit about what the "
        "current data can't isolate.",
        "Reverse Gap (yellow, not red) = cross-store returns — refunds processed "
        "at a store that didn't ring the original sale. 3 Jan-2026 stores: "
        "Atlanta −3.3%, Baybrook −6.3%, Seaport −14.4%. Common at tourist / "
        "flagship locations; flagged yellow to distinguish from operational "
        "problems. Fix: transaction-level POS ↔ staff reconciliation.",
        "Est GC Rev is a proxy (GC Issued × Store AOV) — directionally right, "
        "magnitude noisy. Transaction-level payment-method tagging replaces the "
        "formula, eliminating the 4 blind spots (redemption rate, cross-store "
        "flow, timing, partial use). The 3 HG-Driven flags become precise; "
        "misclassified stores get correctly reclassified.",
    ],
    "columns": [
        # ---- A-C: Identity ----
        {"name": "store", "tier": "raw", "type": "TEXT", "formula": None,
         "description": "Location name (Store+).",
         "flag_rule": None},
        {"name": "traffic_tier", "tier": "tab_derived", "type": "TEXT",
         "formula": "Store+.traffic_tier (High/Med/Low by percentile)",
         "description": "Traffic percentile bucket. Context only — no G/Y/R.",
         "flag_rule": None},
        {"name": "staff_count", "tier": "bi_derived", "type": "INTEGER",
         "formula": "COUNTIF(Staff Hours+.location == store)",
         "description": "Associates at this location (count of Staff Hours+ rows).",
         "flag_rule": None},

        # ---- D-G: Gap ----
        {"name": "store_gross", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Store gross sales, Jan 2026 (Store+.this_month_gross_sales).",
         "flag_rule": None},
        {"name": "staff_gross", "tier": "bi_derived", "type": "REAL",
         "formula": "SUMPRODUCT(Staff+.gross_sales where Staff Hours+.location == store)",
         "description": "Sum of staff gross at this location. Associates must exist in "
                        "both Staff+ and Staff Hours+ (case-insensitive location match) "
                        "to contribute.",
         "flag_rule": None},
        {"name": "gap_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "(store_gross − staff_gross) / store_gross",
         "description": "Attribution gap as % of Store Gross. Positive = unattributed "
                        "revenue (the primary case); negative = cross-store returns. "
                        "Blank when Store Gross=0 (guard; none in Jan-2026 snapshot).",
         "flag_rule": {
             "kind": "threshold",
             # Abs fall-through — same pattern as Associate Perf refund_vs_store
             # (eliminates edge-case gaps for tiny values).
             "bands": [
                 {"color": "green",  "op": "abs_lt",  "value": 0.15},
                 {"color": "yellow", "op": "abs_lte", "value": 0.30},
                 {"color": "red",    "op": "abs_gt",  "value": 0.30},
             ],
             "legend": "green |x|<15% · yellow 15-30% · red >30%",
             "rationale": "±15% is POS-transposition noise (the keying-error floor across "
                          "retail POS systems). >30% = systemic attribution break requiring "
                          "config audit. Abs because under-attribution and over-attribution "
                          "(reverse gap) both signal the same data problem.",
         }},
        {"name": "gap_d", "tier": "bi_derived", "type": "REAL",
         "formula": "store_gross − staff_gross",
         "description": "Attribution gap in dollars. Positive = unattributed revenue.",
         "flag_rule": None},

        # ---- H-M: Diagnostics ----
        {"name": "traffic", "tier": "raw", "type": "INTEGER", "formula": None,
         "description": "Foot traffic count, Jan 2026 (Store+.this_month_traffic).",
         "flag_rule": None},
        {"name": "traffic_per_staff", "tier": "bi_derived", "type": "REAL",
         "formula": "traffic / staff_count",
         "description": "Staffing load ratio. High = stretched coverage. Feeds Coverage "
                        "Gap flag (P75 cut).",
         "flag_rule": {
             "kind": "percentile",
             "direction": "lower_is_better",
             "cut_low": 0.33, "cut_high": 0.75,
             "legend": "green <P33 · yellow P33-P75 · red >P75",
             "rationale": "Fleet-relative because T/S scales with store format "
                          "(flagship vs boutique). 0.75 cut (not 0.67) isolates the "
                          "top-quartile-worst cohort — the actionable staffing alerts.",
         }},
        {"name": "est_gc_rev", "tier": "tab_derived", "type": "REAL",
         "formula": "HG+.est_revenue_impact (first-row-wins by store)",
         "description": "Estimated HG double-count $ from gift-card recycling. Zero when "
                        "gift_cards_generated=0 for this store.",
         "flag_rule": None},
        {"name": "gc_pct_of_gap", "tier": "bi_derived", "type": "REAL",
         "formula": "est_gc_rev / gap_d (only if gap_d > 0 AND est_gc_rev > 0)",
         "description": "Share of Gap $ attributable to HG gift-card recycling. >50% = "
                        "HG is the primary driver. Blank when gap_d ≤ 0 or est_gc_rev = 0 "
                        "(mirrors sheet IF(OR(G<=0,J=0),\"\",...)).",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<",  "value": 0.25},
                 {"color": "yellow", "op": "<=", "value": 0.50},
                 {"color": "red",    "op": ">",  "value": 0.50},
             ],
             "legend": "green <25% · yellow 25-50% · red >50%",
             "rationale": ">50% means HG gift-card dedup is the structural fix — "
                          "Ontology's order-level GC dedup feature resolves this without "
                          "any store-side change. <25% = noise.",
         }},
        {"name": "refund_gap_d", "tier": "bi_derived", "type": "REAL",
         "formula": "|Store+.this_month_returns| − |Σ Staff+.refunds by location|",
         "description": "Dollar difference between store-recorded returns and sum of "
                        "associate-attributed refunds. High = refund attribution problem "
                        "(returns processed without associate linkage).",
         "flag_rule": None},
        {"name": "refund_pct_of_gap", "tier": "bi_derived", "type": "REAL",
         "formula": "refund_gap_d / gap_d (only if gap_d > 0)",
         "description": "Share of Gap $ driven by refund-side attribution. >25% = "
                        "refund-driven. Blank when gap_d ≤ 0.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<",  "value": 0.10},
                 {"color": "yellow", "op": "<=", "value": 0.25},
                 {"color": "red",    "op": ">",  "value": 0.25},
             ],
             "legend": "green <10% · yellow 10-25% · red >25%",
             "rationale": ">25% means refund-location matching + return-attribution fix "
                          "(structural Ontology feature) resolves the gap. <10% = within "
                          "normal refund-timing noise.",
         }},

        # ---- N-O: Verdict ----
        {"name": "primary_flag", "tier": "bi_derived", "type": "TEXT",
         "formula": (
             "Cascade (first match wins): "
             "1. Reverse Gap (gap%<−2%) · "
             "2. HG-Driven (gc_pct>50% AND gap$>$5K) · "
             "3. Coverage Gap (t/s>P75 AND gap%>15%) · "
             "4. Refund-Driven (refund_pct>25% AND refund$>$3K AND gap%>15%) · "
             "5. High Gap (gap%>30%) · "
             "6. Moderate Gap (gap%>15%) · "
             "7. OK (default)"
         ),
         "description": "Single root-cause label per store. Cascade order is load-bearing — "
                        "specific causes (HG / Coverage / Refund) fire before generic "
                        "severity (High/Moderate Gap).",
         "flag_rule": {
             "kind": "categorical",
             "mapping": PRIMARY_FLAG_COLORS,
             "legend": "OK→G · Moderate/Reverse→Y · HG/Coverage/Refund/High→R",
             "rationale": "Colors weight by fixability: specific structural fixes (red) "
                          "are where Ontology ingest delivers automated resolution; Moderate "
                          "Gap + Reverse Gap (yellow) are monitoring, not emergencies; "
                          "OK (green) is attribution-healthy (|gap|<15%).",
         }},
        {"name": "ontology_fix", "tier": "bi_derived", "type": "TEXT",
         "formula": "flag → fix mapping (empty if OK)",
         "description": "Automated Ontology ingest feature that resolves this store's "
                        "attribution issue. Empty for OK.",
         "flag_rule": None},
    ],
}


def compute(conn) -> dict:
    store_rows       = plus_registry.compute("store", conn)
    staff_rows       = plus_registry.compute("staff", conn)
    staff_hours_rows = plus_registry.compute("staff_hours", conn)
    hg_rows          = plus_registry.compute("hg", conn)

    # Case-insensitive store join — mirrors sheet MATCH (see associate_perf.py:276).
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
    staff_gross_by_loc: dict[str, float] = {}
    staff_refunds_abs_by_loc: dict[str, float] = {}
    for sh in staff_hours_rows:
        k = _k(sh.get("location"))
        if k is None:
            continue
        staff_count_by_loc[k] = staff_count_by_loc.get(k, 0) + 1
        s = staff_by_id.get(str(sh.get("staff"))) or {}
        gross = s.get("gross_sales")
        if gross is not None:
            staff_gross_by_loc[k] = staff_gross_by_loc.get(k, 0.0) + float(gross)
        refunds = s.get("refunds")
        if refunds is not None:
            staff_refunds_abs_by_loc[k] = staff_refunds_abs_by_loc.get(k, 0.0) + abs(float(refunds))

    # HG+ est_revenue_impact — first-row-wins per store (mirrors INDEX/MATCH).
    hg_est_by_loc: dict[str, float] = {}
    for hg in hg_rows:
        k = _k(hg.get("store_location"))
        if k is None or k in hg_est_by_loc:
            continue
        v = hg.get("est_revenue_impact")
        hg_est_by_loc[k] = float(v) if v is not None else 0.0

    # --- Pass 1: compute per-store row fields (except primary_flag which needs P75) ---

    rows: list[dict] = []
    for st in store_rows:
        loc = st.get("store_location")
        k = _k(loc)
        store_gross = st.get("this_month_gross_sales")
        traffic = st.get("this_month_traffic")
        returns_val = st.get("this_month_returns")

        staff_ct = staff_count_by_loc.get(k, 0) if k else 0
        staff_gross = staff_gross_by_loc.get(k, 0.0) if k else 0.0
        staff_refunds_abs = staff_refunds_abs_by_loc.get(k, 0.0) if k else 0.0

        # F/G: Gap % and Gap $ — None when Store Gross=0 or missing (Southampton edge).
        if store_gross in (None, 0):
            gap_pct = None
            gap_d = None
        else:
            gap_d = store_gross - staff_gross
            gap_pct = gap_d / store_gross

        # I: Traffic / Staff — None when no staff (shouldn't happen in data).
        t_per_s = (traffic / staff_ct) if (traffic is not None and staff_ct > 0) else None

        # J: Est GC Revenue
        est_gc = hg_est_by_loc.get(k, 0.0) if k else 0.0

        # K: GC % of Gap — gated (matches sheet IF(OR(G<=0,J=0),"",...)).
        gc_pct_of_gap = (
            est_gc / gap_d
            if (gap_d is not None and gap_d > 0 and est_gc > 0)
            else None
        )

        # L: Refund Gap $ — |Store Returns| − |Σ Staff Refunds|
        store_ret_abs = abs(float(returns_val)) if returns_val is not None else 0.0
        refund_gap_d = store_ret_abs - staff_refunds_abs

        # M: Refund % of Gap — gated on gap_d > 0 (matches sheet IF(OR(G<=0,G=""),"",...)).
        refund_pct_of_gap = (
            refund_gap_d / gap_d
            if (gap_d is not None and gap_d > 0)
            else None
        )

        rows.append({
            "store":               loc,
            "traffic_tier":        _title_tier(st.get("traffic_tier")),
            "staff_count":         staff_ct,
            "store_gross":         store_gross,
            "staff_gross":         staff_gross,
            "gap_pct":             gap_pct,
            "gap_d":               gap_d,
            "traffic":             traffic,
            "traffic_per_staff":   t_per_s,
            "est_gc_rev":          est_gc,
            "gc_pct_of_gap":       gc_pct_of_gap,
            "refund_gap_d":        refund_gap_d,
            "refund_pct_of_gap":   refund_pct_of_gap,
            # primary_flag + ontology_fix filled in pass 2
            "primary_flag":        None,
            "ontology_fix":           None,
        })

    # --- Pass 2: compute P75 of Traffic/Staff, run 7-flag cascade ---
    from . import percentile as _percentile  # lazy to avoid circular import at module load

    t_per_s_values = [r["traffic_per_staff"] for r in rows if r["traffic_per_staff"] is not None]
    p75_tps = _percentile(t_per_s_values, 0.75) if t_per_s_values else None

    for r in rows:
        gp = r["gap_pct"]
        gd = r["gap_d"]
        gc = r["gc_pct_of_gap"]
        rp = r["refund_pct_of_gap"]
        rgd = r["refund_gap_d"]
        tps = r["traffic_per_staff"]

        # Cascade — first match wins. Order is load-bearing. Mirrors sheet N formula.
        if gp is not None and gp < -0.02:
            flag = "Reverse Gap"
        elif gc is not None and gc > 0.50 and gd is not None and gd > 5000:
            flag = "HG-Driven"
        elif (p75_tps is not None and tps is not None and tps > p75_tps
              and gp is not None and gp > 0.15):
            flag = "Coverage Gap"
        elif (rp is not None and rp > 0.25 and rgd > 3000
              and gp is not None and gp > 0.15):
            flag = "Refund-Driven"
        elif gp is not None and gp > 0.30:
            flag = "High Gap"
        elif gp is not None and gp > 0.15:
            flag = "Moderate Gap"
        else:
            flag = "OK"

        r["primary_flag"] = flag
        r["ontology_fix"] = FIX_MAP[flag]

    # Sort by Gap % DESC, Nones last (Southampton at the bottom).
    rows.sort(key=lambda r: (r["gap_pct"] is None, -(r["gap_pct"] or 0)))

    # --- Per-cell flag colors -----------------------------------------------

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
