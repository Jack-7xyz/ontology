"""Store Intelligence — unified fleet view. Per-store rollup of P&L, labor efficiency,
clienteling, and (Phase-exit) multi-domain triage.

Source-of-truth: canonical Google Sheet "Store Intelligence" tab.
  1:1 column order vs sheet cols A..O. Red Count / Red Domains (cols P-Q) deferred
  until all 6 BI dashboards exist (need cross-dashboard flag rollup).

Upstream (9 Plus tabs per sheet header):
  Store+, Staff Hours+, Staff+, HG+, Payroll+, Visual+, VOC+, Cash+, Inventory+
"""

from __future__ import annotations

from typing import Any

from .. import plus as plus_registry


META: dict[str, Any] = {
    "id": "store_intel",
    "label": "Store Intelligence",
    "description": "Unified fleet view: P&L waterfall, labor efficiency, clienteling, and "
                   "(Phase-exit) multi-domain triage. One row per store (120). "
                   "Red Count / Red Domains deferred until all 6 BI dashboards exist.",
    "upstream_plus": ["store", "staff_hours", "staff", "hg", "payroll",
                      "visual", "voc", "cash", "inventory"],
    "takeaways": [
        "120 stores — Red Count is the single-number triage. Distribution: "
        "RC=0 → 38 · RC=1 → 47 · RC=2 → 29 · RC=3 → 6 · RC≥4 → 0. Red Count "
        "triggers investigation; Red Domains + downstream dashboards explain "
        "root cause.",
        "Carlsbad — highest problem density in fleet: RC=3 on Return, Payroll, "
        "and HG, with a 23% return rate. Red Count surfaces it from the 120-row "
        "scorecard; Red Domains names the three tabs to open next.",
        "8 domains drive Red Count, each with a live threshold: Return (%ile), "
        "Attribution Gap (>±30%), Inventory (±10%), HG Missing (>5), Visual "
        "(≥2.5), VOC (<60), Cash (<3/5), Payroll Budget (>130%). Red Count = "
        "sum of reds. Same threshold set is reused by Ops Compliance — one "
        "source of truth.",
        "Discount Rate carries no G/Y/R — fleet max is 2.2%, uniformly "
        "disciplined. The domain effectively never fires. Preserved as a "
        "visibility column to confirm discipline rather than guess.",
        "Return %, CVR, Rev/Labor Hour are percentile-colored within this "
        "snapshot (not absolute thresholds). Fleet sets its own baseline — "
        "threshold adapts to this retailer and recalibrates as fleet composition "
        "changes.",
        "Ontology Net Sales = Net Sales − Est GC Revenue. Backs out the HG gift-"
        "card recycling double-count so the scorecard shows the organic baseline "
        "without opening HG Intel. Delta signals recycling exposure per store.",
    ],
    "columns": [
        # ---- Identity ----
        {"name": "store", "tier": "raw", "type": "TEXT", "formula": None,
         "description": "Location name.",
         "flag_rule": None},

        {"name": "traffic_tier", "tier": "tab_derived", "type": "TEXT",
         "formula": "PERCENTILE(traffic): High >P67 · Med P33-P67 · Low <P33",
         "description": "Percentile-based traffic bucket. Primary filter dimension.",
         "flag_rule": None},

        {"name": "staff_count", "tier": "bi_derived", "type": "INTEGER",
         "formula": "COUNTIF(Staff Hours+.location == store)",
         "description": "Associates at this location (row count in Staff Hours+).",
         "flag_rule": None},

        # ---- P&L ----
        {"name": "gross_sales", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Total gross sales this period (from Store+).",
         "flag_rule": None},

        {"name": "discounts", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Total discount amount (negative). Fleet max ~2.2% — uniform discipline.",
         "flag_rule": None},

        {"name": "discount_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "abs(discounts) / gross_sales",
         "description": "Discount rate. No G/Y/R — uniformly low fleet-wide.",
         "flag_rule": None},

        {"name": "returns", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Total return amount (negative). Includes cross-store returns.",
         "flag_rule": None},

        {"name": "return_pct", "tier": "tab_derived", "type": "REAL",
         "formula": "abs(returns) / gross_sales",
         "description": "Return rate. Percentile within snapshot (lower is better).",
         "flag_rule": {
             "kind": "percentile",
             "direction": "lower_is_better",
             "cut_low": 0.33, "cut_high": 0.67,
             "legend": "green <P33 · yellow P33-P67 · red >P67",
             "rationale": "Live PERCENTILE — no portable absolute threshold across "
                          "retailers. Fleet defines its own baseline. "
                          "DB: P33=14.5%, P67=18.6%, median 17.4%.",
         }},

        {"name": "net_sales", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales + discounts + returns",
         "description": "Revenue after known deductions (discounts & returns).",
         "flag_rule": None},

        {"name": "ontology_net_sales", "tier": "bi_derived", "type": "REAL",
         "formula": "net_sales − (first HG+ row's est_revenue_impact for this store)",
         "description": "Net Sales minus estimated GC-recycling revenue from HG+. "
                        "Delta vs Net Sales = HG recycling exposure.",
         "flag_rule": None},

        # ---- Growth ----
        {"name": "yoy_growth", "tier": "tab_derived", "type": "REAL",
         "formula": "(gross_sales − comp_gross_sales_ly) / comp_gross_sales_ly",
         "description": "Year-over-year comp growth.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": ">",  "value": 0.05},
                 {"color": "yellow", "op": "between", "value": [0.0, 0.05]},
                 {"color": "red",    "op": "<",  "value": 0.0},
             ],
             "legend": "green >5% · yellow 0–5% · red <0%",
             "rationale": "5% = healthy comp growth (beats typical specialty-retail "
                          "benchmark). 0% = hold. Negative = comp decline — material "
                          "regression vs prior year, board-level concern.",
         }},

        # ---- Efficiency ----
        {"name": "cvr", "tier": "tab_derived", "type": "REAL",
         "formula": "orders / traffic",
         "description": "Conversion rate. Percentile within snapshot (higher is better).",
         "flag_rule": {
             "kind": "percentile",
             "direction": "higher_is_better",
             "cut_low": 0.33, "cut_high": 0.67,
             "legend": "green >P67 · yellow P33-P67 · red <P33",
             "rationale": "Live PERCENTILE — CVR varies by store format (mall vs "
                          "street vs outlet). Fleet-relative is defensible within "
                          "the same retailer; absolute benchmarks aren't portable.",
         }},

        {"name": "aov", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales / orders",
         "description": "Average order value.",
         "flag_rule": None},

        {"name": "rev_per_labor_hour", "tier": "bi_derived", "type": "REAL",
         "formula": "gross_sales / SUM(Staff Hours+.hours where location == store)",
         "description": "Labor productivity. Percentile within snapshot (higher is better).",
         "flag_rule": {
             "kind": "percentile",
             "direction": "higher_is_better",
             "cut_low": 0.33, "cut_high": 0.67,
             "legend": "green >P67 · yellow P33-P67 · red <P33",
             "rationale": "Labor productivity varies by store format and traffic "
                          "tier — fleet-relative captures outliers in context. "
                          "Low rev/labor-hour = overstaffing or weak selling, "
                          "both operator-actionable.",
         }},

        {"name": "endear_rpm", "tier": "tab_derived", "type": "REAL",
         "formula": "endear_attributed_revenue / endear_messages_sent",
         "description": "Endear revenue per message. Clienteling ROI.",
         "flag_rule": None},

        # ---- Triage (BI-derived rollup — shares logic with Ops Compliance) ----
        {"name": "red_count", "tier": "bi_derived", "type": "INTEGER",
         "formula": "ops_compliance.compute_red_count_and_domains()[i][0] — 8 "
                    "domains: Return, Attr Gap, Payroll, Visual, VOC, Cash, HG, "
                    "Inventory",
         "description": "Domains in red (of 8). Same 8 domains as Ops Compliance "
                        "Red Count — shared helper keeps triage number consistent "
                        "across dashboards.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==",      "value": 0},
                 {"color": "yellow", "op": "between", "value": [1, 2]},
                 {"color": "red",    "op": ">=",      "value": 3},
             ],
             "legend": "green =0 · yellow 1-2 · red ≥3",
             "rationale": "Shared with Ops Compliance — one number, one "
                          "threshold, so the VP reads the fleet the same way "
                          "from every dashboard.",
         }},

        {"name": "red_domains", "tier": "bi_derived", "type": "TEXT",
         "formula": "ops_compliance.compute_red_count_and_domains()[i][1] — "
                    "comma-sep domain labels",
         "description": "Which domains fired red (comma-separated). Makes the "
                        "Red Count self-explanatory without opening Ops Compliance.",
         "flag_rule": None},
    ],
}


def compute(conn) -> dict:
    """Build Store Intelligence rows + per-cell flag colors.

    Returns {rows: [...], flags: [{col_name: 'green'|'yellow'|'red'|None}, ...]}.
    Red Count / Red Domains come from the shared ops_compliance helper.
    """
    # Late import — avoid module-load cycle.
    from . import ops_compliance as ops

    store_rows = plus_registry.compute("store", conn)
    staff_hours_rows = plus_registry.compute("staff_hours", conn)
    hg_rows = plus_registry.compute("hg", conn)

    # Ops Compliance rows carry the 8 domain inputs + match by store.
    ops_out = ops.compute(conn)
    rc_dom_by_store: dict[str, tuple[int, str]] = {}
    # We need the Red Count + Red Domains BEFORE ops_out is sorted by RC — but
    # compute_red_count_and_domains is pure, so re-derive from the sorted rows
    # (sort doesn't change values, just order). Index by store name.
    rc_dom = ops.compute_red_count_and_domains(ops_out["rows"])
    for r, (c, d) in zip(ops_out["rows"], rc_dom):
        loc = r.get("store")
        if loc:
            rc_dom_by_store[loc] = (c, d)

    # Index Staff Hours+ by location: count of rows + sum of hours.
    staff_count_by_loc: dict[str, int] = {}
    labor_hours_by_loc: dict[str, float] = {}
    for sh in staff_hours_rows:
        loc = sh.get("location")
        if loc is None:
            continue
        staff_count_by_loc[loc] = staff_count_by_loc.get(loc, 0) + 1
        h = sh.get("hours")
        if h is not None:
            labor_hours_by_loc[loc] = labor_hours_by_loc.get(loc, 0.0) + float(h)

    # Index HG+ by store_location → first row's est_revenue_impact (matches sheet MATCH behavior).
    hg_rev_impact_by_loc: dict[str, float] = {}
    for hg in hg_rows:
        loc = hg.get("store_location")
        if loc is None or loc in hg_rev_impact_by_loc:
            continue
        ri = hg.get("est_revenue_impact")
        if ri is not None:
            hg_rev_impact_by_loc[loc] = float(ri)

    rows: list[dict] = []
    for s in store_rows:
        loc = s.get("store_location")
        gross = s.get("this_month_gross_sales")
        disc = s.get("this_month_discounts")
        rets = s.get("this_month_returns")

        discount_pct = None
        if gross not in (None, 0) and disc is not None:
            discount_pct = abs(disc) / gross

        net_sales = s.get("net_sales")
        hg_impact = hg_rev_impact_by_loc.get(loc, 0.0) if loc else 0.0
        ontology_net_sales = (net_sales - hg_impact) if net_sales is not None else None

        labor_hrs = labor_hours_by_loc.get(loc) if loc else None
        rev_per_lh = None
        if gross is not None and labor_hrs not in (None, 0):
            rev_per_lh = gross / labor_hrs

        rc, rd = rc_dom_by_store.get(loc, (None, ""))

        rows.append({
            "store":               loc,
            "traffic_tier":        s.get("traffic_tier"),
            "staff_count":         staff_count_by_loc.get(loc, 0) if loc else 0,
            "gross_sales":         gross,
            "discounts":           disc,
            "discount_pct":        discount_pct,
            "returns":             rets,
            "return_pct":          s.get("return_rate"),  # Store+ already computes this
            "net_sales":           net_sales,
            "ontology_net_sales":     ontology_net_sales,
            "yoy_growth":          s.get("yoy_growth"),
            "cvr":                 s.get("cvr"),
            "aov":                 s.get("aov"),
            "rev_per_labor_hour":  rev_per_lh,
            "endear_rpm":          s.get("endear_rpm"),
            "red_count":           rc,
            "red_domains":         rd,
        })

    # Sort by gross_sales DESC to match sheet default ordering.
    rows.sort(key=lambda r: -(r.get("gross_sales") or 0))

    # Compute per-cell flag colors across all rows (late import to avoid bi/__init__ cycle).
    from . import compute_flags_for_column
    flag_matrix: list[dict[str, str | None]] = [{} for _ in rows]
    for col in META["columns"]:
        rule = col.get("flag_rule")
        if rule is None:
            continue
        colors = compute_flags_for_column(col["name"], rule, rows)
        for i, color in enumerate(colors):
            flag_matrix[i][col["name"]] = color

    return {"rows": rows, "flags": flag_matrix}
