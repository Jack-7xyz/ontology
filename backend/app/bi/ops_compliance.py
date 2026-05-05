"""Ops Compliance — cross-domain compliance rollup + Red Count triage.

Source-of-truth: canonical Google Sheet "Ops Compliance" tab (gid=1075873820).
  19 cols A-S. 8 flagged domains drive Red Count; 4 supporting info cols
  (Payroll Max Week, Any Late, HG PII Flag, TO Consistency) are visibility-only.

Red Count domains (locked 2026-04-13 with Jack):
    1. Return Rate       (percentile, lower-better)
    2. True Attr Gap %   (abs threshold)
    3. Inventory Var %   (abs threshold)
    4. HG Missing Units  (threshold)
    5. Visual Score      (threshold, lower-better)
    6. VOC Score         (threshold, higher-better)
    7. Cash Compliance   (threshold, higher-better)
    8. Payroll Budget %  (threshold, lower-better — Max Week is viz-only)

Discount Rate excluded (fleet max 2.19% — uniform discipline, no signal).
Any Late / HG PII Flag have G/Y/R for visibility but DO NOT contribute to Red Count
(Any Late already reflected in Visual Score avg; HG PII is a distinct legal flag,
operational HG risk is captured via HG Missing Units).

Data caveats (verified in source sheet):
  - Cash Compliance: Seaport = 7 (anomalous — beyond 5/5 scale), Americana at Brand = blank.
    Both treated as "no flag" by the =5 rule. Surfaced in column description.
"""

from __future__ import annotations

from typing import Any

from .. import plus as plus_registry


# --- Red Count domain spec ----------------------------------------------------
# (col_name, kind, is_red_fn) — kind documents the rule; is_red_fn evaluates.
# is_red_fn takes (value, all_values) — all_values only needed for percentile.

def _ret_is_red(v, all_vals):
    if v is None:
        return False
    from . import percentile
    p67 = percentile([x for x in all_vals if x is not None], 0.67)
    return p67 is not None and v > p67


# Display order matches sheet Red Domains formula (scripts/build_store_intelligence.py:169-178).
DOMAIN_LABELS = ["Return", "Attr Gap", "Payroll", "Visual", "VOC", "Cash", "HG", "Inventory"]


def compute_red_count_and_domains(rows: list[dict]) -> list[tuple[int, str]]:
    """Compute the 8-domain Red Count + comma-sep domain labels per row.

    Public — re-used by Store Intel for its deferred Red Count / Red Domains cols.
    Rows must carry the Ops Compliance shape (return_rate, true_attr_gap_pct, etc.).
    """
    return_vals = [r.get("return_rate") for r in rows]
    out: list[tuple[int, str]] = []
    for r in rows:
        flags: list[str] = []
        # 1. Return Rate — percentile >P67 = red (live fleet baseline)
        if _ret_is_red(r.get("return_rate"), return_vals):
            flags.append("Return")
        # 2. True Attr Gap % — |x| > 0.30
        v = r.get("true_attr_gap_pct")
        if v is not None and abs(v) > 0.30:
            flags.append("Attr Gap")
        # 3. Payroll Budget % — > 130 (avg weekly; Max Week is viz-only)
        v = r.get("payroll_budget_pct")
        if v is not None and v > 130:
            flags.append("Payroll")
        # 4. Visual Score — >= 2.5 (1=best, 3=worst)
        v = r.get("visual_score")
        if v is not None and v >= 2.5:
            flags.append("Visual")
        # 5. VOC Score — < 60 (0-100 scale)
        v = r.get("voc_score")
        if v is not None and v < 60:
            flags.append("VOC")
        # 6. Cash Compliance — < 3 (of 5 weekly deposits)
        v = r.get("cash_compliance")
        if v is not None and v < 3:
            flags.append("Cash")
        # 7. HG Missing Units — > 5
        v = r.get("hg_missing_units")
        if v is not None and v > 5:
            flags.append("HG")
        # 8. Inventory Variance — |x| > 0.10
        v = r.get("inventory_variance")
        if v is not None and abs(v) > 0.10:
            flags.append("Inventory")
        out.append((len(flags), ", ".join(flags)))
    return out


META: dict[str, Any] = {
    "id": "ops_compliance",
    "label": "Ops Compliance",
    "description": "Cross-domain compliance rollup + Red Count triage. "
                   "Sort by Red Count desc → Gross desc to find highest-revenue "
                   "stores with the most compliance issues. Filter Red Count ≥3 "
                   "for the RC≥3 intervene tier. Payroll Max Week %, Any Late, "
                   "and HG PII Flag are visibility-only (not in Red Count).",
    "upstream_plus": ["store", "staff", "staff_hours", "hg", "payroll",
                      "visual", "voc", "cash", "inventory"],
    "takeaways": [
        "RC≥3 stores (intervene tier) — the 6 stores flagged on 3+ domains. "
        "Filter Red Count ≥3 in this dashboard.",
        "Payroll dominates the RC≥3 tier — [live count] of [live total] RC≥3 "
        "stores have payroll as a red domain. 78% of all stores exceeded payroll "
        "budget at least one week in Jan. Fashion Island averages 272% payroll "
        "budget across 5 weeks; Indianapolis averages 304% (336% max week). "
        "Opens the Day-1 question: is the budget realistic, or are stores "
        "genuinely overstaffing?",
        # TODO: replace [live count] / [live total] with values derived from rows at runtime.
        "Baltimore — RC=3 across Visual + Inventory + Attr Gap. Sales can be "
        "fine while operations are broken; cross-domain rollup makes the "
        "pattern visible.",
        "Carlsbad: 32 missing HG units (2.9% missing rate) + payroll averaging "
        "177% + 23% return rate — highest problem density in fleet. RC=3 shared "
        "with Store Intel via compute_red_count_and_domains(). One threshold set, "
        "two dashboards, identical triage output.",
        "Red Count is the single-number triage — G=0 · Y=1-2 · R≥3. Sort by RC "
        "then Gross desc surfaces highest-revenue trouble stores first.",
        "Every threshold has a rationale: Attribution Gap >30% red = fleet "
        "median (17.6%) + 1σ (13.5%) = 31.0% DB-verified. Inventory ±5% / ±10% "
        "= median+0.7σ / +1.8σ. VOC ≥80 green = mystery-shop industry pass "
        "cutoff. Configurability is an Ontology improvement — operator sets the "
        "bar, platform enforces.",
        "Visibility-only columns (excluded from Red Count to avoid double-"
        "counting): Payroll Max Week % (inside Budget %), Any Late (inside "
        "Visual avg), HG PII Flag (separate legal flag, not an ops compliance "
        "signal). G/Y/R preserved for surface context.",
        "Data caveats — Cash Compliance: Seaport=7 (beyond 5-week scale) and "
        "Americana at Brand=blank both fall through unflagged. Source-data "
        "artifact, not a rule miss. Surfaced so the empty cell is trusted.",
    ],
    "columns": [
        # ---- Identity ----
        {"name": "store", "tier": "raw", "type": "TEXT", "formula": None,
         "description": "Location name.",
         "flag_rule": None},

        # ---- Triage (bi_derived) ----
        {"name": "red_count", "tier": "bi_derived", "type": "INTEGER",
         "formula": "SUM of 8 domain flags in red (Return, Attr Gap, Inv Var, "
                    "HG Missing, Visual, VOC, Cash, Payroll Budget)",
         "description": "Domains in red (of 8). G=0 · Y 1-2 · R≥3. "
                        "Excludes Discount Rate (no signal), Payroll Max Week "
                        "(double-count), and visibility-only cols P/R.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==", "value": 0},
                 {"color": "yellow", "op": "between", "value": [1, 2]},
                 {"color": "red",    "op": ">=", "value": 3},
             ],
             "legend": "green =0 · yellow 1-2 · red ≥3",
             "rationale": "8 independent domain flags summed. VP-configurable "
                          "starting points — 'VP sets the bar, Ontology enforces'.",
         }},

        # ---- Revenue context (for prioritization) ----
        {"name": "gross_sales", "tier": "raw", "type": "REAL", "formula": None,
         "description": "Total gross sales this period (Jan 2026, from Store+).",
         "flag_rule": None},

        {"name": "net_sales", "tier": "tab_derived", "type": "REAL",
         "formula": "gross_sales + discounts + returns",
         "description": "Revenue after known deductions.",
         "flag_rule": None},

        {"name": "ontology_net_sales", "tier": "bi_derived", "type": "REAL",
         "formula": "net_sales − (first HG+ row's est_revenue_impact for this store)",
         "description": "Net Sales minus estimated gift-card recycling revenue "
                        "(from HG+). Delta vs Net Sales surfaces HG recycling exposure "
                        "inline — drill to HG Intelligence for detail.",
         "flag_rule": None},

        # ---- 8 domain sources ----
        {"name": "discount_rate", "tier": "bi_derived", "type": "REAL",
         "formula": "abs(discounts) / gross_sales",
         "description": "Fleet max 2.19% — uniformly disciplined. No G/Y/R and "
                        "excluded from Red Count (no signal).",
         "flag_rule": {
             "kind": "none",
             "legend": "no G/Y/R — fleet uniformly disciplined",
             "rationale": "DB-verified: fleet max 2.19%, median 0.6%. No "
                          "actionable signal exists at this scale.",
         }},

        {"name": "return_rate", "tier": "bi_derived", "type": "REAL",
         "formula": "abs(returns) / gross_sales",
         "description": "Live percentile — fleet sets its own baseline. "
                        "Contributes to Red Count at >P67.",
         "flag_rule": {
             "kind": "percentile",
             "direction": "lower_is_better",
             "cut_low": 0.33, "cut_high": 0.67,
             "legend": "green <P33 · yellow P33-P67 · red >P67",
             "rationale": "No portable absolute threshold across retailers — the "
                          "fleet defines its own baseline. DB: P33=14.5%, P67=18.6%.",
         }},

        {"name": "gc_return_ratio", "tier": "bi_derived", "type": "REAL",
         "formula": "HG+.gift_cards_generated / (abs(this_month_returns) / store_aov)",
         "description": "GC issued per estimated return transaction. Higher = more GCs per return = cycling signal (red). Fleet median ~13.8%. P33=10%, P67=18%.",
         "flag_rule": {
             "kind": "percentile",
             "direction": "higher_is_better",
             "cut_low": 0.33, "cut_high": 0.67,
             "legend": "green >P67 · yellow P33–P67 · red <P33",
             "rationale": "Higher ratio = more returns converting to GCs (value staying in fleet). "
                          "Fleet P33=10%, median=13.8%, P67=18%. Live percentile baseline.",
         }},

        {"name": "true_attr_gap_pct", "tier": "bi_derived", "type": "REAL",
         "formula": "(store_gross − sum(staff_gross for this location)) / store_gross",
         "description": "Share of store gross not attributed to any associate. "
                        "ABS — reverse gaps (over-attribution) count equally.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "abs_lt",      "value": 0.15},
                 {"color": "yellow", "op": "abs_between", "value": [0.15, 0.30]},
                 {"color": "red",    "op": "abs_gt",      "value": 0.30},
             ],
             "legend": "green |x|<15% · yellow 15-30% · red >30%",
             "rationale": "15% ≈ fleet ABS median (17.6%, DB-verified) — catches "
                          "meaningful gaps. 30% ≈ median + 1σ (13.5%) = 31.0% — "
                          "severe tail. ABS because under- and over-attribution "
                          "are both POS/workflow issues.",
         }},

        {"name": "inventory_variance", "tier": "raw", "type": "REAL",
         "formula": "(stock_count_validated − stock_count_expected) / expected",
         "description": "Inventory reconciliation variance (from Inventory+). "
                        "Negative = shrinkage/theft; positive = over-count.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "abs_lte",     "value": 0.05},
                 {"color": "yellow", "op": "abs_between", "value": [0.05, 0.10]},
                 {"color": "red",    "op": "abs_gt",      "value": 0.10},
             ],
             "legend": "green |x|≤5% · yellow 5-10% · red >10%",
             "rationale": "DB ABS median 1.9%, stdev 4.5%. 5% ≈ normal counting "
                          "tolerance (median+0.7σ); >10% = data-integrity breakdown. "
                          "ABS — both shrinkage and over-count are integrity issues.",
         }},

        {"name": "hg_missing_units", "tier": "raw", "type": "INTEGER",
         "formula": "HG+.missing_units (direct passthrough)",
         "description": "HG replacement units missing in reconciliation. "
                        "Systematic cycling anchor — feeds HG Intelligence.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==",      "value": 0},
                 {"color": "yellow", "op": "between", "value": [1, 5]},
                 {"color": "red",    "op": ">",       "value": 5},
             ],
             "legend": "green =0 · yellow 1-5 · red >5",
             "rationale": "Integer-scale operational threshold. DB: median 1.0, "
                          "15 stores >5. >5 = systemic cycling pattern "
                          "(HG-Processor detection anchor).",
         }},

        {"name": "hg_missing_rate", "tier": "bi_derived", "type": "REAL",
         "formula": "HG+.missing_rate (missing_units / qty_expected)",
         "flag_rule": {"kind": "none"},
         "description": "Share of expected HG units missing. Context only — no G/Y/R. "
                        "RC threshold uses absolute units (>5); rate normalizes for store volume. "
                        "Carlsbad: 2.9% (32/1,122). Blank when store has no HG+ row."},

        {"name": "visual_score", "tier": "raw", "type": "REAL",
         "formula": "Visual+.visual_score (avg of 3 floorset submissions, 1=best)",
         "description": "Floorset visual compliance avg (1-3 scale, 1=best).",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<",       "value": 1.5},
                 {"color": "yellow", "op": "between", "value": [1.5, 2.4]},
                 {"color": "red",    "op": ">=",      "value": 2.5},
             ],
             "legend": "green <1.5 · yellow 1.5-2.4 · red ≥2.5",
             "rationale": "DB median 1.0, mean 1.47. ≥2.5 = consistently failing "
                          "(top decile of drift). Caveat: zero correlation with "
                          "fine revenue — compliance signal only, not a revenue "
                          "predictor.",
         }},

        {"name": "voc_score", "tier": "raw", "type": "REAL",
         "formula": "VOC+.voc_overall_score (direct passthrough)",
         "description": "Voice-of-Customer mystery-shop composite (0-100).",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": ">=",      "value": 80},
                 {"color": "yellow", "op": "between", "value": [60, 79.99]},
                 {"color": "red",    "op": "<",       "value": 60},
             ],
             "legend": "green ≥80 · yellow 60-79 · red <60",
             "rationale": "80 ≈ standard mystery-shop 'pass' cutoff. <60 = "
                          "bottom-decile store experience. DB right-skewed: "
                          "median 100, mean 93.5, min 55.4.",
         }},

        {"name": "cash_compliance", "tier": "raw", "type": "INTEGER",
         "formula": "Cash+.total_compliant_weeks (of 5)",
         "description": "On-time weekly deposits (of 5). "
                        "Caveat: Seaport=7 (anomalous — beyond 5-week scale) and "
                        "Americana at Brand=blank — both fall through as unflagged.",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "==",      "value": 5},
                 {"color": "yellow", "op": "between", "value": [3, 4]},
                 {"color": "red",    "op": "<",       "value": 3},
             ],
             "legend": "green =5 · yellow 3-4 · red <3",
             "rationale": "5/5 = full weekly-deposit SLA. <3 = breaking audit "
                          "trigger. Strict =5 matches sheet formula (=M=5).",
         }},

        {"name": "payroll_budget_pct", "tier": "raw", "type": "REAL",
         "formula": "Payroll+.avg_budget_pct (mean of 5 weekly budget %)",
         "description": "Avg weekly payroll budget %. Drives Red Count "
                        "(Max Week % is viz-only to avoid double-count).",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<=",      "value": 100},
                 {"color": "yellow", "op": "between", "value": [100.01, 130]},
                 {"color": "red",    "op": ">",       "value": 130},
             ],
             "legend": "green ≤100% · yellow 101-130% · red >130%",
             "rationale": "100% = on budget. DB median 102.5%, stdev 36.7% → "
                          "130% ≈ median+0.75σ (material overspend). Avg "
                          "smooths single-week spikes.",
         }},

        # ---- Visibility-only (NOT in Red Count) ----
        {"name": "payroll_max_week_pct", "tier": "raw", "type": "REAL",
         "formula": "Payroll+.max_week_pct (max of 5 weekly budget %)",
         "description": "Highest single-week budget %. Visibility only — "
                        "NOT in Red Count (avoids double-counting with Budget %).",
         "flag_rule": {
             "kind": "threshold",
             "bands": [
                 {"color": "green",  "op": "<=",      "value": 130},
                 {"color": "yellow", "op": "between", "value": [130.01, 170]},
                 {"color": "red",    "op": ">",       "value": 170},
             ],
             "legend": "green ≤130% · yellow 131-170% · red >170% — NOT in Red Count",
             "rationale": "Single-week blowouts (Fashion Island 272%, fleet max "
                          "336%). 170% = systemic shift-planning failure. "
                          "Already reflected in Budget % — kept separate for "
                          "spike visibility without double-counting the flag.",
         }},

        {"name": "any_late", "tier": "tab_derived", "type": "TEXT",
         "formula": "Visual+.any_late — YES if any floorset submitted late",
         "description": "Floorset lateness flag. Visibility only — NOT in Red Count "
                        "(already reflected in Visual Score avg).",
         "flag_rule": {
             "kind": "categorical",
             "mapping": {"YES": "red"},
             "legend": "red = YES — NOT in Red Count",
             "rationale": "Process-quality signal. Lateness contributes to the "
                          "Visual Score avg that does drive Red Count — surfaced "
                          "here as an independent audit-trail flag.",
         }},

        {"name": "cash_discrepancy_pct", "tier": "tab_derived", "type": "REAL",
         "formula": "Cash+.discrepancy_pct — abs(discrepancy) / expected",
         "description": "Cash deposit discrepancy vs expected. Informational — "
                        "operational compliance is captured via cash_compliance.",
         "flag_rule": None},

        {"name": "hg_pii_flag", "tier": "tab_derived", "type": "TEXT",
         "formula": "HG+.pii_flag — YES if match or type non-compliant",
         "description": "HG PII/protocol non-compliance. Visibility only — "
                        "NOT in Red Count (separate legal flag from HG Missing).",
         "flag_rule": {
             "kind": "categorical",
             "mapping": {"YES": "red"},
             "legend": "red = YES — NOT in Red Count",
             "rationale": "Legal/compliance flag surfaced independently from "
                          "HG Missing Units (the operational Red Count driver).",
         }},

        {"name": "to_consistency", "tier": "tab_derived", "type": "TEXT",
         "formula": "Inventory+.to_consistency — 'Full' if all 5 weeks else N/5",
         "description": "Weekly TO receiving consistency. Informational only.",
         "flag_rule": None},
    ],
}


def compute(conn) -> dict:
    """Build Ops Compliance rows + per-cell flag colors.

    Returns {rows: [...], flags: [{col_name: 'green'|'yellow'|'red'|None}, ...]}.
    Rows sorted by Red Count DESC, then gross_sales DESC (revenue prioritization).
    """
    store_rows = plus_registry.compute("store", conn)
    staff_hours_rows = plus_registry.compute("staff_hours", conn)
    staff_rows = plus_registry.compute("staff", conn)
    hg_rows = plus_registry.compute("hg", conn)
    payroll_rows = plus_registry.compute("payroll", conn)
    visual_rows = plus_registry.compute("visual", conn)
    voc_rows = plus_registry.compute("voc", conn)
    cash_rows = plus_registry.compute("cash", conn)
    inventory_rows = plus_registry.compute("inventory", conn)

    # Staff Hours+: staff → location (for attributing staff gross to stores).
    loc_by_staff: dict[Any, str] = {}
    for sh in staff_hours_rows:
        name = sh.get("staff")
        loc = sh.get("location")
        if name is None or loc is None:
            continue
        # First-wins (mirrors sheet INDEX/MATCH behavior).
        if name not in loc_by_staff:
            loc_by_staff[name] = loc

    # Staff+: sum staff gross_sales by location.
    staff_gross_by_loc: dict[str, float] = {}
    for st in staff_rows:
        name = st.get("name")
        loc = loc_by_staff.get(name)
        if loc is None:
            continue
        gs = st.get("gross_sales")
        if gs is not None:
            staff_gross_by_loc[loc] = staff_gross_by_loc.get(loc, 0.0) + float(gs)

    # HG+: first-row est_revenue_impact by location (matches sheet MATCH).
    hg_impact_by_loc: dict[str, float] = {}
    hg_missing_by_loc: dict[str, float] = {}
    hg_missing_rate_by_loc: dict[str, float] = {}
    hg_pii_by_loc: dict[str, str] = {}
    hg_gc_issued_by_loc: dict[str, float] = {}
    for hg in hg_rows:
        loc = hg.get("store_location")
        if loc is None:
            continue
        if loc not in hg_impact_by_loc:
            ri = hg.get("est_revenue_impact")
            if ri is not None:
                hg_impact_by_loc[loc] = float(ri)
            mu = hg.get("missing_units")
            if mu is not None:
                hg_missing_by_loc[loc] = float(mu)
            mr = hg.get("missing_rate")
            if mr is not None:
                hg_missing_rate_by_loc[loc] = float(mr)
            pii = hg.get("pii_flag")
            if pii:
                hg_pii_by_loc[loc] = pii
            gc = hg.get("gift_cards_generated")
            if gc is not None:
                hg_gc_issued_by_loc[loc] = float(gc)

    # Store+ AOV by location (for gc_return_ratio denominator).
    aov_by_loc: dict[str, float] = {
        s["store_location"]: float(s["aov"])
        for s in store_rows
        if s.get("store_location") is not None and s.get("aov") is not None
    }

    # Index helpers (first-row-wins per loc) for the remaining Plus tabs.
    def _index_first(rows: list[dict], loc_key: str, cols: list[str]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for r in rows:
            loc = r.get(loc_key)
            if loc is None or loc in out:
                continue
            out[loc] = {c: r.get(c) for c in cols}
        return out

    payroll_idx = _index_first(payroll_rows, "store_location",
                               ["avg_budget_pct", "max_week_pct"])
    visual_idx = _index_first(visual_rows, "store_location",
                              ["visual_score", "any_late"])
    voc_idx = _index_first(voc_rows, "store_location", ["voc_overall_score"])
    cash_idx = _index_first(cash_rows, "store", ["total_compliant_weeks", "discrepancy_pct"])
    inventory_idx = _index_first(inventory_rows, "store_location",
                                 ["inventory_variance", "to_consistency"])

    rows: list[dict] = []
    for s in store_rows:
        loc = s.get("store_location")
        gross = s.get("this_month_gross_sales")
        disc = s.get("this_month_discounts")

        discount_rate = None
        if gross not in (None, 0) and disc is not None:
            discount_rate = abs(disc) / gross

        net_sales = s.get("net_sales")
        hg_impact = hg_impact_by_loc.get(loc, 0.0) if loc else 0.0
        ontology_net_sales = (net_sales - hg_impact) if net_sales is not None else None

        # GC Return Ratio = gc_issued / (abs(returns) / aov) — GCs issued per estimated return txn.
        gc_return_ratio = None
        if loc:
            gc = hg_gc_issued_by_loc.get(loc)
            rets = s.get("this_month_returns")
            aov = aov_by_loc.get(loc)
            if gc is not None and rets is not None and aov not in (None, 0):
                est_return_txns = abs(rets) / aov
                if est_return_txns > 0:
                    gc_return_ratio = gc / est_return_txns

        # True Attr Gap % = 1 - (sum staff gross for this loc) / store gross
        true_attr_gap = None
        if gross not in (None, 0) and loc:
            sg = staff_gross_by_loc.get(loc, 0.0)
            true_attr_gap = 1 - (sg / gross)

        p = payroll_idx.get(loc, {}) if loc else {}
        v = visual_idx.get(loc, {}) if loc else {}
        vo = voc_idx.get(loc, {}) if loc else {}
        c = cash_idx.get(loc, {}) if loc else {}
        inv = inventory_idx.get(loc, {}) if loc else {}

        rows.append({
            "store":                loc,
            # Red Count filled after pass 2 (needs percentile of return_rate).
            "red_count":            None,
            "gross_sales":          gross,
            "net_sales":            net_sales,
            "ontology_net_sales":      ontology_net_sales,
            "discount_rate":        discount_rate,
            "return_rate":          s.get("return_rate"),
            "gc_return_ratio":      gc_return_ratio,
            "true_attr_gap_pct":    true_attr_gap,
            "inventory_variance":   inv.get("inventory_variance"),
            "hg_missing_units":     hg_missing_by_loc.get(loc) if loc else None,
            "hg_missing_rate":      hg_missing_rate_by_loc.get(loc) if loc else None,
            "visual_score":         v.get("visual_score"),
            "voc_score":            vo.get("voc_overall_score"),
            "cash_compliance":      c.get("total_compliant_weeks"),
            "payroll_budget_pct":   p.get("avg_budget_pct"),
            "payroll_max_week_pct": p.get("max_week_pct"),
            "any_late":             v.get("any_late"),
            "cash_discrepancy_pct": c.get("discrepancy_pct"),
            "hg_pii_flag":          hg_pii_by_loc.get(loc) if loc else None,
            "to_consistency":       inv.get("to_consistency"),
        })

    # Pass 2: compute Red Count (needs all rows for percentile of return_rate).
    rc_dom = compute_red_count_and_domains(rows)
    for r, (rc, _) in zip(rows, rc_dom):
        r["red_count"] = rc

    # Sort: Red Count DESC, then gross DESC.
    rows.sort(key=lambda r: (-(r.get("red_count") or 0), -(r.get("gross_sales") or 0)))

    # Per-cell flag colors.
    from . import compute_flags_for_column
    flag_matrix: list[dict[str, str | None]] = [{} for _ in rows]
    for col in META["columns"]:
        rule = col.get("flag_rule")
        if rule is None or rule.get("kind") == "none":
            continue
        colors = compute_flags_for_column(col["name"], rule, rows)
        for i, color in enumerate(colors):
            flag_matrix[i][col["name"]] = color

    return {"rows": rows, "flags": flag_matrix}
