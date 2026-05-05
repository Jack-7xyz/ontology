"""HG+ — staging Plus tab over `hg_data`. Cross-tab dep on Store+ for AOV (revenue impact).

Derived metrics:
  - missing_rate       = missing_units / qty_expected (BLANK when qty_expected is 0 or NULL)
  - est_revenue_impact = gift_cards_generated × store_aov  (joined from Store+ by store_location)
  - pii_flag           = "YES" if (match_non_compliant > 0 OR type_non_compliant > 0)
  - hg_risk_score      = 0..3 sum of three risk conditions; BLANK if qty_expected is BLANK

NB on hg_risk_score condition #2: Jack's spec written verbatim was
   "match, non-compliant > 0 OR type, non-compliant = 0"
which reads as ambiguous (likely "= 0" is a typo for "> 0"). Implemented as
   "match_non_compliant > 0 OR type_non_compliant > 0"
because either flag should drive risk up. Confirm intent — easy 1-line flip if wrong.
"""

from __future__ import annotations

from typing import Any

from . import store as store_plus

META: dict[str, Any] = {
    "id": "hg",
    "label": "HG+",
    "source_table": "hg_data",
    "description": "High-Gravity (HG) ops compliance per store-date. Adds estimated revenue impact "
                   "of gift-card generation, a PII compliance flag, and a 0–3 HG risk score.",
    "columns": [
        {"name": "date",                  "tier": "raw", "type": "TEXT", "formula": None, "description": "Reporting date."},
        {"name": "store_location",        "tier": "raw", "type": "TEXT", "formula": None, "description": "Store location."},
        {"name": "qty_expected",          "tier": "raw", "type": "REAL", "formula": None, "description": "Expected order quantity."},
        {"name": "missing_units",         "tier": "raw", "type": "REAL", "formula": None, "description": "Units missing vs. expected."},
        {"name": "gift_cards_generated",  "tier": "raw", "type": "REAL", "formula": None, "description": "Gift cards issued during the period."},
        {"name": "match_non_compliant",   "tier": "raw", "type": "REAL", "formula": None, "description": "Match-protocol non-compliance count."},
        {"name": "type_non_compliant",    "tier": "raw", "type": "REAL", "formula": None, "description": "Type-protocol non-compliance count."},

        {"name": "missing_rate",       "tier": "tab_derived", "type": "REAL", "formula": "missing_units / qty_expected (BLANK when qty_expected is 0 or NULL)",
         "description": "Share of expected HG units missing. Context column — RC threshold uses absolute units (>5), not rate."},
        {"name": "est_revenue_impact", "tier": "tab_derived", "type": "REAL", "formula": "gift_cards_generated × store_aov  (joined from Store+)",
         "description": "Estimated revenue impact of gift-card volume, scaled by store's AOV."},
        {"name": "pii_flag",           "tier": "tab_derived", "type": "TEXT", "formula": "YES if (match_non_compliant > 0 OR type_non_compliant > 0) else BLANK",
         "description": "Flagged YES if either match-protocol or type-protocol non-compliance occurred."},
        {"name": "hg_risk_score",      "tier": "tab_derived", "type": "REAL", "formula": "BLANK if qty_expected is BLANK; else sum of: (missing/expected > 0.1), (match>0 OR type>0), (gift_cards > 10)",
         "description": "0..3 risk score. Caveat: gift_cards>10 can fire even when gift-card share of orders is low — interpret with that floor in mind."},
    ],
}


def compute(conn) -> list[dict]:
    rows = [dict(r) for r in conn.execute('SELECT * FROM "hg_data"').fetchall()]

    # Join AOV from Store+ by store_location.
    aov_by_store: dict[str, float] = {
        s["store_location"]: s["aov"]
        for s in store_plus.compute(conn)
        if s.get("store_location") is not None and s.get("aov") is not None
    }

    out: list[dict] = []
    for r in rows:
        gc = r.get("gift_cards_generated")
        store_loc = r.get("store_location")
        store_aov = aov_by_store.get(store_loc) if store_loc else None
        rev_impact = (gc * store_aov) if (gc is not None and store_aov is not None) else None

        match_nc = r.get("match_non_compliant") or 0
        type_nc = r.get("type_non_compliant") or 0
        pii = "YES" if (match_nc > 0 or type_nc > 0) else ""

        # HG risk score
        qty_exp = r.get("qty_expected")
        missing = r.get("missing_units")
        if qty_exp is None:
            risk = None
        else:
            cond1 = 1 if (missing is not None and qty_exp != 0 and (missing / qty_exp) > 0.1) else 0
            cond2 = 1 if (match_nc > 0 or type_nc > 0) else 0
            cond3 = 1 if (gc is not None and gc > 10) else 0
            risk = cond1 + cond2 + cond3

        qty_exp2 = r.get("qty_expected")
        missing2 = r.get("missing_units")
        missing_rate = (missing2 / qty_exp2) if (qty_exp2 is not None and qty_exp2 != 0 and missing2 is not None) else None

        out.append({
            **r,
            "missing_rate": missing_rate,
            "est_revenue_impact": rev_impact,
            "pii_flag": pii,
            "hg_risk_score": risk,
        })
    return out
