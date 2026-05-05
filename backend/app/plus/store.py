"""Store+ — staging Plus tab over `store` source. Adds CVR, AOV, return rate, net sales,
endear RPM, fine mix %, and traffic_tier (high/med/low at 67/33 percentile splits)."""

from __future__ import annotations

from typing import Any

META: dict[str, Any] = {
    "id": "store",
    "label": "Store+",
    "source_table": "store",
    "description": "Per-store monthly snapshot. Adds conversion, AOV, return rate, net sales, "
                   "endear RPM, fine mix %, and a high/med/low traffic tier.",
    "columns": [
        # ---- raw source columns (Jack's spec order) ----
        {"name": "store_location",            "tier": "raw", "type": "TEXT",  "formula": None, "description": "Store name (raw from source.store)."},
        {"name": "this_month_gross_sales",    "tier": "raw", "type": "REAL",  "formula": None, "description": "Gross sales this month."},
        {"name": "this_month_discounts",      "tier": "raw", "type": "REAL",  "formula": None, "description": "Discounts this month (negative number)."},
        {"name": "this_month_returns",        "tier": "raw", "type": "REAL",  "formula": None, "description": "Returns this month (negative number)."},
        {"name": "this_month_orders",         "tier": "raw", "type": "REAL",  "formula": None, "description": "Order count this month."},
        {"name": "this_month_traffic",        "tier": "raw", "type": "REAL",  "formula": None, "description": "Door traffic this month."},
        {"name": "this_month_fine_net_sales", "tier": "raw", "type": "REAL",  "formula": None, "description": "Fine-jewelry net sales this month."},
        {"name": "comp_gross_sales_ly",       "tier": "raw", "type": "REAL",  "formula": None, "description": "Comp-store gross sales, last year."},
        {"name": "comp_discounts_ly",         "tier": "raw", "type": "REAL",  "formula": None, "description": "Comp-store discounts, last year."},
        {"name": "comp_returns_ly",           "tier": "raw", "type": "REAL",  "formula": None, "description": "Comp-store returns, last year."},
        {"name": "comp_orders_ly",            "tier": "raw", "type": "REAL",  "formula": None, "description": "Comp-store orders, last year."},
        {"name": "comp_traffic_ly",           "tier": "raw", "type": "REAL",  "formula": None, "description": "Comp-store traffic, last year."},
        {"name": "endear_messages_sent",      "tier": "raw", "type": "REAL",  "formula": None, "description": "Endear messages sent this month."},
        {"name": "endear_attributed_revenue", "tier": "raw", "type": "REAL",  "formula": None, "description": "Revenue attributed to Endear this month."},

        # ---- tab_derived columns (Jack's spec order) ----
        {"name": "cvr",            "tier": "tab_derived", "type": "REAL", "formula": "this_month_orders / this_month_traffic",
         "description": "Conversion rate — orders divided by door traffic."},
        {"name": "aov",            "tier": "tab_derived", "type": "REAL", "formula": "this_month_gross_sales / this_month_orders",
         "description": "Average order value — gross sales divided by orders."},
        {"name": "return_rate",    "tier": "tab_derived", "type": "REAL", "formula": "abs(this_month_returns) / this_month_gross_sales",
         "description": "Return rate — magnitude of returns over gross sales."},
        {"name": "yoy_growth",     "tier": "tab_derived", "type": "REAL", "formula": "(this_month_gross_sales - comp_gross_sales_ly) / comp_gross_sales_ly",
         "description": "Year-over-year gross sales growth vs comp-LY same month."},
        {"name": "net_sales",      "tier": "tab_derived", "type": "REAL", "formula": "gross + discounts + returns",
         "description": "Net sales — gross plus (negative) discounts plus (negative) returns."},
        {"name": "endear_rpm",     "tier": "tab_derived", "type": "REAL", "formula": "endear_attributed_revenue / endear_messages_sent",
         "description": "Endear revenue per message sent."},
        {"name": "fine_mix_pct",   "tier": "tab_derived", "type": "REAL", "formula": "this_month_fine_net_sales / net_sales",
         "description": "Fine-jewelry share of net sales."},
        {"name": "traffic_tier",   "tier": "tab_derived", "type": "TEXT", "formula": "high if traffic > p67(all stores), low if < p33, else med",
         "description": "Traffic tier vs. all stores in this snapshot. p67/p33 splits → high/med/low."},
    ],
}


def compute(conn) -> list[dict]:
    from . import safe_div, percentile

    rows = [dict(r) for r in conn.execute('SELECT * FROM "store"').fetchall()]

    # Pre-compute percentile thresholds across all stores in this snapshot.
    traffics = [r["this_month_traffic"] for r in rows if r["this_month_traffic"] is not None]
    p67 = percentile(traffics, 67)
    p33 = percentile(traffics, 33)

    out: list[dict] = []
    for r in rows:
        gross    = r.get("this_month_gross_sales")
        discs    = r.get("this_month_discounts")
        rets     = r.get("this_month_returns")
        orders   = r.get("this_month_orders")
        traffic  = r.get("this_month_traffic")
        fine_ns  = r.get("this_month_fine_net_sales")
        e_msgs   = r.get("endear_messages_sent")
        e_rev    = r.get("endear_attributed_revenue")

        net_sales = (
            (gross or 0) + (discs or 0) + (rets or 0)
            if gross is not None else None
        )

        # traffic tier per Jack's spec (67/33 percentile splits)
        if traffic is None or p67 is None or p33 is None:
            tier = None
        elif traffic > p67:
            tier = "high"
        elif traffic > p33:
            tier = "med"
        else:
            tier = "low"

        comp_gross = r.get("comp_gross_sales_ly")
        yoy = (
            safe_div((gross - comp_gross) if (gross is not None and comp_gross is not None) else None, comp_gross)
        )

        derived = {
            "cvr":           safe_div(orders, traffic),
            "aov":           safe_div(gross, orders),
            "return_rate":   safe_div(abs(rets) if rets is not None else None, gross),
            "yoy_growth":    yoy,
            "net_sales":     net_sales,
            "endear_rpm":    safe_div(e_rev, e_msgs),
            "fine_mix_pct":  safe_div(fine_ns, net_sales),
            "traffic_tier":  tier,
        }
        out.append({**r, **derived})
    return out
