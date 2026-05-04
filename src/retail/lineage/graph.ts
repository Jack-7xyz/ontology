// Static lineage graph metadata (BI dashboards + Mechanics). Shared between
// Lineage.tsx (renders the DAG) and RightPanel.tsx (LineageNodeHelper).
//
// Source nodes come from /api/snapshot/info; Plus nodes come from /api/plus/info.
// BI + Mechanics are stubs (Phase 5+ / Phase 4+) — names are locked, logic ships later.

export type LineageLayer = 'source' | 'plus' | 'bi' | 'mech';

export interface LineageNodeRef {
  layer: LineageLayer;
  id: string;
}

export interface BiDashboard {
  id: string;
  label: string;
  plus: string[]; // upstream Plus tab ids
  description: string;
  phase: string;
}

export interface Mechanic {
  id: string;
  label: string;
  bi: string[]; // upstream BI dashboard ids
  // utility / logic / insights / thresholds removed 2026-04-14: backend
  // mechanics/<id>.py META is the single source of truth, fetched at render
  // time via api.mechanicRows(id) / api.mechanicsInfo(). Catalog and lineage
  // graph carry only identity + topology.
  phase: string;
}

// Build order (locked 2026-04-13): Store → Ops → Associate → Attribution → Fine-Mix → HG.
// Order here drives vertical stacking in Lineage view + LeftNav section order.
export const BI_DASHBOARDS: BiDashboard[] = [
  {
    id: 'store_intel',
    label: 'Store Intelligence',
    // Matches backend META.upstream_plus — full 9-tab fan-in (3 live in compute; rest wire
    // when Red Count / Red Domains rollup lands at Phase-4 exit).
    plus: ['store', 'staff_hours', 'staff', 'hg', 'payroll', 'visual', 'voc', 'cash', 'inventory'],
    description: 'Unified fleet view — P&L waterfall, labor efficiency, clienteling, and multi-domain triage.',
    phase: 'Phase 4',
  },
  {
    id: 'ops_compliance',
    label: 'Ops Compliance',
    // Matches backend META.upstream_plus. Dropship is NOT consumed — removed 2026-04-13.
    plus: ['store', 'staff', 'staff_hours', 'hg', 'payroll', 'visual', 'voc', 'cash', 'inventory'],
    description: 'Cross-domain compliance rollup + 8-domain Red Count triage.',
    phase: 'Phase 4',
  },
  {
    id: 'associate_perf',
    label: 'Associate Performance',
    // Matches backend META.upstream_plus. Store+ joined for return_rate + traffic_tier;
    // HG+ joined for store-level hg_risk_score; staff_hours authoritative for location/title/hours.
    plus: ['staff', 'staff_hours', 'hg', 'store'],
    description: 'Per-associate productivity with store-relative efficiency + HG Processor detection.',
    phase: 'Phase 4',
  },
  {
    id: 'attribution_intel',
    label: 'Attribution Intelligence',
    // Matches backend META.upstream_plus — Store+ drives identity/gross/traffic/returns;
    // Staff+ provides associate gross+refunds; Staff Hours+ joins associates to stores;
    // HG+ first-row-wins supplies est_revenue_impact for the GC % of Gap diagnostic.
    plus: ['store', 'staff', 'staff_hours', 'hg'],
    description: 'Store-to-staff attribution gap with 7-flag root-cause cascade + Ontology Fix mapping.',
    phase: 'Phase 4',
  },
  {
    id: 'fine_mix_intel',
    label: 'Fine Mix Intelligence',
    // Matches backend META.upstream_plus — Store+ drives identity/net/mix%/AOV; Staff+
    // supplies fine_units_sold per associate; Staff Hours+ joins associates to stores;
    // Visual+ supplies the floorset audit score column.
    plus: ['store', 'staff', 'staff_hours', 'visual'],
    description: 'Fine-jewelry penetration: mix %, attach rate, AOV, opportunity sizing, '
      + 'and 5-way quadrant classification. Exports shared compute_store_fine_aov() '
      + 'helper reused by Associate Performance cols L/M.',
    phase: 'Phase 4',
  },
  {
    id: 'hg_intel',
    label: 'HG Intelligence',
    // Matches backend META.upstream_plus — Store+ drives gross/net/discounts/returns/AOV;
    // HG+ supplies est_revenue_impact/qty_expected/gc_issued/missing_units/pii/risk_score;
    // Inventory+ supplies inventory_variance for the Inv Risk Flag.
    plus: ['store', 'hg', 'inventory'],
    description: 'Revenue waterfall (Gross → Deduped Gross → Net → Ontology Net Revenue) + '
      + 'HG retention effectiveness + inventory risk. Surfaces GC-recycling inflation '
      + 'so VP separates organic growth from HG double-count.',
    phase: 'Phase 4',
  },
];

export const MECHANICS: Mechanic[] = [
  { id: 'red_count',         label: 'Red Count',                bi: ['store_intel', 'ops_compliance'],                          phase: 'Phase 4' },
  { id: 'rev_decomp',        label: 'Revenue Decomposition',    bi: ['hg_intel', 'attribution_intel'],                           phase: 'Phase 5' },
  { id: 'attr_gap',          label: 'Attribution Gap',          bi: ['attribution_intel'],                                       phase: 'Phase 5' },
  { id: 'hg_processor',      label: 'HG Processor Detection',   bi: ['associate_perf', 'hg_intel'],                              phase: 'Phase 6' },
  { id: 'perf_flag_cascade', label: 'Performance Flag Cascade', bi: ['store_intel', 'associate_perf', 'ops_compliance'],         phase: 'Phase 5' },
  // id aligned with bi/improvements.py catalog `mechanic` field.
  { id: 'fine_rev',          label: 'Fine Revenue Estimation',  bi: ['fine_mix_intel'],                                          phase: 'Phase 6' },
];

export const BI_BY_ID: Record<string, BiDashboard> = Object.fromEntries(
  BI_DASHBOARDS.map((b) => [b.id, b]),
);
export const MECH_BY_ID: Record<string, Mechanic> = Object.fromEntries(
  MECHANICS.map((m) => [m.id, m]),
);

// Reverse lookups — which downstream consumes a given node?
export function biConsumingPlus(plusId: string): BiDashboard[] {
  return BI_DASHBOARDS.filter((b) => b.plus.includes(plusId));
}
export function mechConsumingBi(biId: string): Mechanic[] {
  return MECHANICS.filter((m) => m.bi.includes(biId));
}
