"""HG Intelligence — Happiness Guarantee revenue waterfall + gift-card recycling impact.

Source-of-truth: canonical Google Sheet "HG Intelligence" tab.
  120 stores, 19 cols A-S. Column order mirrors sheet exactly.
  Reference builder: scripts/build_hg_intelligence.py.

Framing
-------
  HG Intel tells a revenue-waterfall story: Gross → Deduped Gross → Net Sales →
  Ontology Net Revenue. The top-line (Gross) double-counts HG gift-card
  recycling — a customer returns an item, receives a GC, and re-spends it;
  the second transaction hits gross again even though it's the same $. Ontology
  Net Revenue strips that double-count so the VP can distinguish organic
  growth from GC-recycling inflation.

  Recycle Rate is a POSITIVE signal: high = the HG program is retaining
  returned-$ as reissued GC (working as designed). GC / Gross % is a
  NEGATIVE signal: high = large share of top-line is GC re-spend inflation.

  HG Processor framing: associates who process a lot of HG
  returns aren't underperformers and aren't fraud — they're doing a
  different job. This dashboard is the store-level revenue lens; HG
  Processor detection lives in Associate Performance.

Columns (sheet A-S)
-------------------
  --- Revenue Waterfall ---
  A Store              — raw   (Store+.store_location)
  B Gross Sales        — raw   (Store+.this_month_gross_sales)
  C Est GC Revenue     — tab+  (HG+.est_revenue_impact — gc × store_aov)
  D Deduped Gross      — bi+   (Gross − Est GC Rev)
  E Discounts          — raw   (Store+.this_month_discounts, negative)
  F Returns            — raw   (Store+.this_month_returns, negative)
  G Net Sales          — tab+  (Store+.net_sales = gross+disc+ret)
  H Ontology Net Revenue  — bi+   (Net Sales − Est GC Rev)
  --- HG Detail ---
  I AOV                — tab+  (Store+.aov)
  J QTY Expected       — raw   (HG+.qty_expected)
  K GC Issued          — raw   (HG+.gift_cards_generated)
  L Recycle Rate       — bi+   (Est GC Rev / |Returns|)                  [flagged thr]
  M GC / Gross %       — bi+   (Est GC Rev / Gross)                      [flagged thr]
  --- Inventory Cross-Ref ---
  N Missing Units      — raw   (HG+.missing_units)
  O Missing Rate       — bi+   (Missing / QTY Expected)                  [flagged thr]
  P Inv Variance       — tab+  (Inventory+.inventory_variance)
  Q Inv Risk Flag      — bi+   (YES if Missing>5 AND Inv Var>0)          [categorical]
  --- Compliance ---
  R PII Non-Compliant  — bi+   (Match NC + Type NC count)
  S HG Risk Score      — tab+  (HG+.hg_risk_score, 0-3 composite)        [flagged thr]

Flag rules
----------
  L Recycle Rate   — percentile fleet-relative higher=better: G top-33% · Y mid-33% · R bottom-33%
  M GC / Gross %   — threshold fall-through lower=better: G <3% · Y 3-6% · R >6%
  O Missing Rate   — threshold fall-through lower=better: G =0 · Y 0-10% · R >10%
  Q Inv Risk Flag  — categorical: "YES" → red
  S HG Risk Score  — threshold: G =0 · Y =1 · R ≥2

Data caveats
------------
  - Est GC Rev is an ESTIMATE (gc_issued × store_aov), not a ledger value.
    AOV assumption: each GC ~= one average-order re-spend. Upper bound.
  - Recycle Rate uses |Returns| denominator. Stores with ~$0 returns blank
    out (guard). Denominator includes all returns, not just HG-driven; this
    is deliberate — HG's value is retaining ANY return-$, not just its own.
  - HG+ rows can be missing for a store (no HG activity this period). Est GC
    Rev, QTY Expected, GC Issued, Missing Units, HG Risk all blank in that
    case; the store's revenue waterfall still computes (Gross / Net Sales).
  - Inventory+ first-row-wins per store (sheet INDEX/MATCH semantics).
  - HG Risk Score formula (from HG+): 1pt each for (missing/expected>10%),
    (match_nc>0 OR type_nc>0), (gc_issued>10). Max 3. Caveat: the gc>10
    floor can fire for low GC/Gross stores — interpret with that floor in
    mind (documented in HG+ META).
  - Case-insensitive store join (_k=lower) — mirrors the
    attribution_intel / associate_perf pattern.
"""

from __future__ import annotations

from typing import Any

from .. import plus as plus_registry


META: dict[str, Any] = {
    "id": "hg_intel",
    "label": "HG Intelligence",
    "description": (
        "Happiness Guarantee revenue impact + gross decomposition. Revenue "
        "waterfall: Gross → Deduped Gross (organic baseline, GC re-purchases "
        "removed) → Net Sales (standard P&L) → Ontology Net Revenue (organic "
        "baseline after deductions). Recycle Rate = HG retention effectiveness "
        "(high = good, more return-$ retained via GC). GC / Gross % = revenue "
        "inflation (high = bad, large share of top-line is GC re-spend). "
        "Inventory Risk Flag surfaces HG units missing AND inventory over-count — "
        "items that may have been resold on-floor."
    ),
    "upstream_plus": ["store", "hg", "inventory"],
    "takeaways": [
        "Gross Sales double-counts HG gift-card recycling: customer returns an "
        "item, receives a GC, re-spends it; both transactions hit top-line. "
        "Ontology Net Revenue = Net Sales − Est GC Rev is the organic baseline to "
        "evaluate stores against. Net Sales itself is a correct P&L (GC inflation "
        "and return offsets cancel algebraically); the distortion lives in "
        "Gross, not Net.",
        "Fleet revenue waterfall: $12.82M gross → $12.44M Deduped Gross → "
        "$10.50M Net → $10.12M Ontology Net. $378K estimated GC recycling "
        "inflation (2.9% fleet-wide) — small in aggregate, material per-store. "
        "Only 3 of 120 stores above 6% GC/Gross (red); 67 below 3% (green). "
        "The risk is concentrated, not distributed.",
        "Irvine Spectrum — #1 by gross at $512K with 36.7% Recycle Rate and "
        "7.7% GC/Gross inflation. 271 gift cards issued, 20 missing units. "
        "Ranking by gross alone would reward Irvine Spectrum despite the "
        "recycling inflation. Ontology fix: semantic layer treats GC issuance as "
        "a return type; net revenue metric strips GC redemptions automatically.",
        "Fashion Island — fleet's highest Recycle Rate (40.8%), $29K GC rev, "
        "7.5% GC/Gross. Pairs with the 272% payroll spike surfaced in Ops "
        "Compliance. One store, two dashboards, two related operational "
        "problems — the cross-dashboard read is the platform's added value.",
        "Long Beach: 8.1% GC/Gross — highest in fleet on a $193K base ($16K "
        "GC rev). Smaller store, larger relative inflation. Ranking by "
        "GC/Gross % surfaces this kind of store; ranking by gross would miss "
        "it entirely.",
        "Recycle Rate is a POSITIVE metric (high = HG retaining return-$ as "
        "reissued GC — program working). GC/Gross % is the NEGATIVE twin "
        "(high = large share of top-line is GC re-spend — inflation). "
        "Fleet median Recycle Rate 15.3%, mean 16.4%; 8 stores above 30% green.",
        "HG Risk Score distribution: Score 0 → 40 · Score 1 → 48 · Score 2 → 31 · Score 3 "
        "→ 1. Composite of missing-rate >10%, any PII non-compliance, GC "
        "volume >10. Sorts triage toward stores needing operational attention. "
        "Inv Risk Flag (Missing>5 AND Inv Variance>0) fires on 1 store — HG "
        "units didn't return AND inventory is over-counted; items may be back "
        "on the sales floor.",
        "HG Processor framing (carries to Associate Performance): associates "
        "processing HG returns aren't underperformers and aren't fraud cases "
        "— they're doing a different job. Reassign, don't discipline. This "
        "dashboard is the store-level lens; associate-level detection lives "
        "in Associate Performance via the same threshold set.",
        "Est GC Rev (GC Issued × Store AOV) is the weakest formula in the "
        "model. 4 blind spots: no redemption rate (assumes 100%), no "
        "cross-store flow (GC issued at A, redeemed at C is invisible), no "
        "timing, no partial-use. Transaction-level payment-method tagging "
        "replaces the formula — measured, not estimated. Fashion Island's "
        "overshoot-to-209% cases stop happening.",
        "Data caveats: Est GC Rev is an upper-bound estimate, not a ledger "
        "value. Stores with no HG+ row blank the HG-detail columns but still "
        "compute the revenue waterfall (Gross / Deduped / Net / Ontology Net) "
        "from Store+ alone — the waterfall works for HG-clean stores too.",
    ],
    "columns": [
        # ---- A-H: Revenue Waterfall ----
        {"name": "store", "tier": "raw", "type": "TEXT", "formula": None,
         "description": "Location name (Store+).",
         "flag_rule": None},
        {"name": "gross_sales", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Total gross sales, Jan 2026 (Store+.this_month_gross_sales). "
                        "Double-counts HG gift-card recycling — see Est GC Revenue.",
         "flag_rule": None},
        {"name": "est_gc_revenue", "tier": "tab_derived", "type": "REAL",
         "formula": "HG+.est_revenue_impact = gift_cards_generated × store_aov",
         "description": "Estimated double-count $ from HG gift-card recycling "
                        "(GC × AOV). Upper-bound estimate. Zero when this store "
                        "has no HG+ activity.",
         "flag_rule": None},
        {"name": "deduped_gross", "tier": "bi_derived", "type": "REAL",
         "formula": "gross_sales − est_gc_revenue",
         "description": "Gross with GC recycling double-count removed — "
                        "organic gross baseline before discounts/returns.",
         "flag_rule": None},
        {"name": "discounts", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Store discounts this month (negative value, from Store+).",
         "flag_rule": None},
        {"name": "returns", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Store returns this month (negative value, from Store+).",
         "flag_rule": None},
        {"name": "net_sales", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales + discounts + returns  (discounts/returns are negative)",
         "description": "Standard P&L net sales (Store+.net_sales).",
         "flag_rule": None},
        {"name": "ontology_net_revenue", "tier": "bi_derived", "type": "REAL",
         "formula": "net_sales − est_gc_revenue",
         "description": "Organic net revenue baseline excluding HG gift-card "
                        "recycling. Delta vs Net Sales = HG double-count exposure.",
         "flag_rule": None},

        # ---- I-M: HG Detail ----
        {"name": "aov", "tier": "tab_derived", "type": "REAL",
         "formula": "Store+.aov = gross_sales / orders",
         "description": "Store average order value (from Store+). Feeds Est GC Rev.",
         "flag_rule": None},
        {"name": "qty_expected", "tier": "raw", "type": "INTEGER", "formula": None,
         "description": "HG returns this store should have processed (HG+.qty_expected). "
                        "Blank when store has no HG+ row.",
         "flag_rule": None},
        {"name": "gc_issued", "tier": "raw", "type": "INTEGER", "formula": None,
         "description": "Gift cards issued as part of HG exchanges "
                        "(HG+.gift_cards_generated).",
         "flag_rule": None},
        {"name": "recycle_rate", "tier": "bi_derived", "type": "REAL",
         "formula": "est_gc_revenue / |returns|  (blank if Est GC Rev=0 or Returns=0)",
         "description": "HG retention effectiveness — share of return-$ retained "
                        "as reissued GC. POSITIVE signal: high = program working.",
         "flag_rule": {
             "kind": "percentile",
             "direction": "higher_is_better",
             "legend": "green top-33% fleet · yellow mid-33% · red bottom-33%",
             "rationale": "Fleet-relative: top-third of stores = HG program retaining "
                          "return-$ as reissued GC above peers. Bottom-third = retention "
                          "lagging cohort — returns leaving as cash refunds at higher "
                          "rate than fleet. Higher is better.",
         }},
        {"name": "gc_gross_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "est_gc_revenue / gross_sales  (blank if Est GC Rev=0 or Gross=0)",
         "description": "Share of gross attributable to GC re-spend. NEGATIVE "
                        "signal: high = large top-line inflation from recycling.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<",  "value": 0.03},
                 {"color": "yellow", "op": "<=", "value": 0.06},
                 {"color": "red",    "op": ">",  "value": 0.06},
             ],
             "legend": "green <3% · yellow 3-6% · red >6%",
             "rationale": ">6% = GC recycling is inflating gross materially; VP "
                          "should discount the store's top-line growth by that "
                          "share before judging performance. <3% = immaterial. "
                          "Fall-through; lower is better.",
         }},

        # ---- N-Q: Inventory Cross-Ref ----
        {"name": "missing_units", "tier": "raw", "type": "INTEGER", "formula": None,
         "description": "HG units not returned to warehouse (HG+.missing_units).",
         "flag_rule": None},
        {"name": "missing_rate", "tier": "bi_derived", "type": "REAL",
         "formula": "missing_units / qty_expected  (blank if qty_expected=0 or missing)",
         "description": "Share of expected HG units missing. Strict 0 = green; "
                        "any missing flags yellow.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==", "value": 0},
                 {"color": "yellow", "op": "<=", "value": 0.10},
                 {"color": "red",    "op": ">",  "value": 0.10},
             ],
             "legend": "green =0% · yellow 0-10% · red >10%",
             "rationale": "Strict 0 floor — any missing HG unit is an integrity "
                          "signal, not noise. >10% = systemic reconciliation "
                          "failure. Fall-through; lower is better.",
         }},
        {"name": "inv_variance", "tier": "tab_derived", "type": "REAL",
         "formula": "Inventory+.inventory_variance = (validated − expected) / expected",
         "description": "Store inventory variance %. Feeds Inv Risk Flag. "
                        "Blank when store has no Inventory+ row.",
         "flag_rule": None},
        {"name": "inv_risk_flag", "tier": "bi_derived", "type": "TEXT",
         "formula": "YES if missing_units>5 AND inv_variance>0 else blank",
         "description": "HG units missing AND inventory over-count — worst-case "
                        "pattern where items may be resold on-floor. Categorical YES/blank.",
         "flag_rule": {
             "kind": "categorical",
             "mapping": {"YES": "red"},
             "legend": "red = YES (Missing>5 AND Inv Var>0)",
             "rationale": "Compound gate: high missing alone could be shrinkage "
                          "elsewhere; over-count alone could be miscount. Together = "
                          "HG units almost certainly back on the sales floor.",
         }},

        # ---- R-S: Compliance ----
        {"name": "pii_non_compliant", "tier": "bi_derived", "type": "INTEGER",
         "formula": "HG+.match_non_compliant + HG+.type_non_compliant",
         "description": "Total PII capture failures (match-protocol + type-protocol). "
                        "Feeds HG Risk Score and ties to Ops Compliance HG PII Flag.",
         "flag_rule": None},
        {"name": "hg_risk_score", "tier": "tab_derived", "type": "INTEGER",
         "formula": "HG+.hg_risk_score — 1pt each: missing_rate>10%, any PII NC, gc_issued>10",
         "description": "Composite 0-3 operational risk. Blank when qty_expected blank. "
                        "Caveat: gc_issued>10 floor can fire even when GC/Gross % is low.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==", "value": 0},
                 {"color": "yellow", "op": "==", "value": 1},
                 {"color": "red",    "op": ">=", "value": 2},
             ],
             "legend": "green =0 · yellow =1 · red ≥2",
             "rationale": "Three independent HG integrity conditions (missing-rate, "
                          "PII, GC volume). ≥2 = multi-dimensional risk requiring "
                          "operational attention. Matches Ops Compliance HG-domain "
                          "threshold semantics.",
         }},
    ],
}


def compute(conn) -> dict:
    """Build HG Intelligence rows + per-cell flag colors.

    Two-pass:
      Pass 1 — per-store fields (waterfall + HG detail + variance).
      Pass 2 — derived flags (Inv Risk Flag, sort, flag matrix).

    Returns {rows: [...], flags: [{col_name: 'green'|'yellow'|'red'|None}, ...]}.
    Sorted by Est GC Revenue DESC — matches sheet sort.
    """
    store_rows     = plus_registry.compute("store", conn)
    hg_rows        = plus_registry.compute("hg", conn)
    inventory_rows = plus_registry.compute("inventory", conn)

    # Case-insensitive store join — mirrors attribution_intel.py pattern.
    def _k(s: Any) -> str | None:
        return s.lower() if isinstance(s, str) else None

    # --- Indexes: HG+ first-row-wins per store (sheet INDEX/MATCH semantics) ---
    hg_by_loc: dict[str, dict] = {}
    for hg in hg_rows:
        k = _k(hg.get("store_location"))
        if k is None or k in hg_by_loc:
            continue
        hg_by_loc[k] = hg

    inv_by_loc: dict[str, dict] = {}
    for inv in inventory_rows:
        k = _k(inv.get("store_location"))
        if k is None or k in inv_by_loc:
            continue
        inv_by_loc[k] = inv

    # --- Pass 1: per-store rows ---
    rows: list[dict] = []
    for st in store_rows:
        loc = st.get("store_location")
        k = _k(loc)
        gross = st.get("this_month_gross_sales")
        discs = st.get("this_month_discounts")
        rets  = st.get("this_month_returns")
        net_s = st.get("net_sales")
        aov_v = st.get("aov")

        hg = hg_by_loc.get(k) if k else None
        inv = inv_by_loc.get(k) if k else None

        est_gc_rev = hg.get("est_revenue_impact") if hg else None
        # Normalize to 0 for waterfall arithmetic (matches sheet IFERROR,0).
        egc_num = float(est_gc_rev) if est_gc_rev is not None else 0.0

        deduped_gross = (gross - egc_num) if gross is not None else None
        ontology_net_rev = (net_s - egc_num) if net_s is not None else None

        qty_exp  = hg.get("qty_expected") if hg else None
        gc_iss   = hg.get("gift_cards_generated") if hg else None
        missing  = hg.get("missing_units") if hg else None
        match_nc = (hg.get("match_non_compliant") or 0) if hg else 0
        type_nc  = (hg.get("type_non_compliant") or 0) if hg else 0
        risk     = hg.get("hg_risk_score") if hg else None

        # L: Recycle Rate — gated (est_gc_rev=0 or returns=0 → None; mirrors sheet IF).
        recycle_rate = None
        if est_gc_rev is not None and est_gc_rev != 0 and rets is not None and rets != 0:
            recycle_rate = float(est_gc_rev) / abs(float(rets))

        # M: GC / Gross % — gated similarly.
        gc_gross_pct = None
        if est_gc_rev is not None and est_gc_rev != 0 and gross not in (None, 0):
            gc_gross_pct = float(est_gc_rev) / float(gross)

        # O: Missing Rate — gated (missing None or qty_expected None/0).
        missing_rate = None
        if missing is not None and qty_exp not in (None, 0):
            missing_rate = float(missing) / float(qty_exp)

        inv_variance = inv.get("inventory_variance") if inv else None

        # Q: Inv Risk Flag — compound gate. "YES" or "".
        inv_risk = ""
        if (missing is not None and missing > 5
                and inv_variance is not None and inv_variance > 0):
            inv_risk = "YES"

        # R: PII Non-Compliant — raw count sum (not the string flag).
        pii_nc = int(match_nc) + int(type_nc) if hg else None

        rows.append({
            # A-H waterfall
            "store":             loc,
            "gross_sales":       gross,
            "est_gc_revenue":    est_gc_rev if est_gc_rev is not None else (0.0 if hg else None),
            "deduped_gross":     deduped_gross,
            "discounts":         discs,
            "returns":           rets,
            "net_sales":         net_s,
            "ontology_net_revenue": ontology_net_rev,
            # I-M HG detail
            "aov":               aov_v,
            "qty_expected":      qty_exp,
            "gc_issued":         gc_iss,
            "recycle_rate":      recycle_rate,
            "gc_gross_pct":      gc_gross_pct,
            # N-Q inventory cross-ref
            "missing_units":     missing,
            "missing_rate":      missing_rate,
            "inv_variance":      inv_variance,
            "inv_risk_flag":     inv_risk,
            # R-S compliance
            "pii_non_compliant": pii_nc,
            "hg_risk_score":     risk,
        })

    # --- Sort: Est GC Revenue DESC (matches sheet sort) ---
    rows.sort(key=lambda r: -(r.get("est_gc_revenue") or 0))

    # --- Per-cell flag colors ---
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
