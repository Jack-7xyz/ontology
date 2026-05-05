"""Staff+ — staging Plus tab over `staff` source. Adds AOV, sales/hour, refund rate, net sales."""

from __future__ import annotations

from typing import Any

META: dict[str, Any] = {
    "id": "staff",
    "label": "Staff+",
    "source_table": "staff",
    "description": "Per-associate sales totals. Adds AOV, sales-per-hour, refund rate, net sales.",
    "columns": [
        {"name": "name",             "tier": "raw", "type": "TEXT", "formula": None, "description": "Associate identifier (numeric IDs ingested as REAL)."},
        {"name": "gross_sales",      "tier": "raw", "type": "REAL", "formula": None, "description": "Gross sales by associate."},
        {"name": "discounts",        "tier": "raw", "type": "REAL", "formula": None, "description": "Discounts (negative)."},
        {"name": "refunds",          "tier": "raw", "type": "REAL", "formula": None, "description": "Refunds (negative)."},
        {"name": "orders",           "tier": "raw", "type": "REAL", "formula": None, "description": "Orders attributed to associate."},
        {"name": "qty_sold",         "tier": "raw", "type": "REAL", "formula": None, "description": "Total units sold."},
        {"name": "fine_units_sold",  "tier": "raw", "type": "REAL", "formula": None, "description": "Fine-jewelry units sold."},
        {"name": "hours_worked",     "tier": "raw", "type": "REAL", "formula": None, "description": "Hours worked in the period."},

        {"name": "aov",            "tier": "tab_derived", "type": "REAL", "formula": "gross_sales / orders",
         "description": "Average order value per associate."},
        {"name": "sales_per_hour", "tier": "tab_derived", "type": "REAL", "formula": "gross_sales / hours_worked",
         "description": "Productivity — gross sales per hour worked."},
        {"name": "refund_rate",    "tier": "tab_derived", "type": "REAL", "formula": "abs(refunds) / gross_sales",
         "description": "Magnitude of refunds over gross sales."},
        {"name": "net_sales",      "tier": "tab_derived", "type": "REAL", "formula": "gross_sales + discounts + refunds",
         "description": "Net sales — gross plus (negative) discounts and refunds."},
    ],
}


def compute(conn) -> list[dict]:
    from . import safe_div

    rows = [dict(r) for r in conn.execute('SELECT * FROM "staff"').fetchall()]
    out: list[dict] = []
    for r in rows:
        gross   = r.get("gross_sales")
        discs   = r.get("discounts")
        refs    = r.get("refunds")
        orders  = r.get("orders")
        hrs     = r.get("hours_worked")

        net_sales = (
            (gross or 0) + (discs or 0) + (refs or 0)
            if gross is not None else None
        )
        derived = {
            "aov":            safe_div(gross, orders),
            "sales_per_hour": safe_div(gross, hrs),
            "refund_rate":    safe_div(abs(refs) if refs is not None else None, gross),
            "net_sales":      net_sales,
        }
        out.append({**r, **derived})
    return out
