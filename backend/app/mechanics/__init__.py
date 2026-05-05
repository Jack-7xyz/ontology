"""Mechanics — single-number stories per store, composed from BI dashboards.

Architecture:
  Source → Plus (staging) → BI Dashboards → **Mechanics** → Utility

Each mechanic module exports:
  - META: {id, label, deck_hook, description, upstream_bi[], utility,
           logic_overview, key_insights[], algorithms[],
           weaknesses[], diagram{kind, spec}, takeaways[], source_notes}
  - compute(conn) → {rows: [...], diagram_data?: {...}}
    Rows are mechanic-specific (Red Count: 8-domain grid per store).

Ontology Improvements are injected at get_meta() time from the same catalog that
feeds BI dashboards (bi/improvements.py:improvements_for_mechanic).
"""

from __future__ import annotations

from typing import Any

from . import red_count
from . import rev_decomp
from . import attr_gap
from . import hg_processor
from . import perf_flag_cascade
from . import fine_rev
from ..bi import improvements as bi_improvements


# Order here drives LeftNav Mechanics ordering (Phase 1 ships only red_count;
# Phases 2-6 append rev_decomp, attr_gap, hg_processor, perf_flag_cascade,
# fine_rev). The Ontology Improvements catalog `mechanic` field references these
# ids — drift is caught at import time via validate_against_mechanic_registry().
REGISTRY: dict[str, Any] = {
    "red_count":         red_count,
    "rev_decomp":        rev_decomp,
    "attr_gap":          attr_gap,
    "hg_processor":      hg_processor,
    "perf_flag_cascade": perf_flag_cascade,
    "fine_rev":          fine_rev,
}


def list_mechanic_ids() -> list[str]:
    return list(REGISTRY.keys())


def get_meta(mechanic_id: str) -> dict:
    """Return the mechanic's META with Ontology Improvements injected from the
    catalog. Shallow copy — the module-level META constant stays untouched."""
    return {
        **REGISTRY[mechanic_id].META,
        "ontology_improvements": bi_improvements.improvements_for_mechanic(mechanic_id),
        "contributing_bi_ids": bi_improvements.contributing_bi_ids_for_mechanic(mechanic_id),
    }


def compute(mechanic_id: str, conn) -> dict:
    """Returns mechanic-specific compute output (shape varies per mechanic)."""
    return REGISTRY[mechanic_id].compute(conn)


# Fail fast at import if the catalog references a mechanic id that isn't in
# REGISTRY. Note: catalog may reference future-phase mechanics (rev_decomp etc.)
# that aren't registered yet — those are tolerated until the corresponding
# phase ships, so we only flag DRIFT (registered ids referenced incorrectly).
# The strict cross-check happens after Phase 6.
_known_mech_ids = set(REGISTRY.keys())
_catalog_mech_ids = set(bi_improvements.mechanic_ids())
# Intentionally one-way: every REGISTRY id should appear in the catalog (so
# the mechanic actually has improvements to surface). Catalog ids without a
# REGISTRY entry are pending-phase, not drift.
_missing_in_catalog = _known_mech_ids - _catalog_mech_ids
if _missing_in_catalog:
    raise RuntimeError(
        f"mechanics REGISTRY ↔ improvements catalog drift: "
        f"registered mechanics with no catalog entries: {sorted(_missing_in_catalog)}"
    )
