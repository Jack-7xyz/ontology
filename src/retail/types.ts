// Shared app types.

// Ontology tier keys — drive tier-click dispatch from Home → RightPanel.
export type TierKey = 'utility' | 'mechanics' | 'bi' | 'plus' | 'source';

export type View =
  | { type: 'home'; tier?: TierKey; lineageFocus?: { layer: 'source' | 'plus' | 'bi' | 'mech'; id: string } }
  | { type: 'source'; table: string }
  | { type: 'plus'; table: string }
  // `anchor` (optional): when set, BiTable scrolls to the row whose primary
  // identity column matches and briefly highlights it. Used by mechanic-page
  // diagrams to drill from a click into the corresponding BI row.
  // `filter_field` + `filter` (optional): when set together, BiTable filters
  // rows client-side to those whose named categorical column equals the given
  // value, and shows a dismissable filter banner. Used by cascade-flowchart
  // bucket click-through (attr_gap → primary_flag, perf_flag_cascade →
  // perf_flag).
  | { type: 'bi'; id: string; anchor?: string; filter_field?: string; filter?: string }
  | { type: 'mech'; id: string; selectedImprovementId?: string }
  | { type: 'ask-ontology' }
  | { type: 'triggers'; selectedImprovementId?: string }
  | { type: 'tasks'; selectedImprovementId?: string };

// Plus column metadata — drives header coloring, description row, and formula sub-row.
export type ColumnTier = 'raw' | 'tab_derived' | 'bi_derived';

export interface PlusColumn {
  name: string;
  tier: ColumnTier;
  type: string;
  formula: string | null;
  description: string;
}

export interface PlusMeta {
  id: string;
  label: string;
  source_table: string;
  description: string;
  columns: PlusColumn[];
}

// BI dashboard flag-rule schema — drives cell coloring + right-panel legend.
export type FlagColor = 'green' | 'yellow' | 'red';

export type FlagOp =
  | '>' | '>=' | '<' | '<=' | '==' | 'between'
  | 'abs_gt' | 'abs_gte' | 'abs_lt' | 'abs_lte' | 'abs_between'
  | 'none';

export type FlagRule =
  | {
      kind: 'threshold';
      legend: string;
      rationale?: string;
      bands: { color: FlagColor; op: FlagOp; value: number | [number, number] | string }[];
    }
  | {
      kind: 'percentile';
      legend: string;
      rationale?: string;
      direction: 'higher_is_better' | 'lower_is_better';
      cut_low?: number;
      cut_high?: number;
    }
  | {
      kind: 'categorical';
      legend: string;
      rationale?: string;
      mapping: Record<string, FlagColor>;
    }
  // Explicit "no G/Y/R" — rationale-only (e.g. Discount Rate: uniform discipline).
  | {
      kind: 'none';
      legend: string;
      rationale?: string;
    }
  // Color copied from another column's flag (e.g. Sales/Hour mirrors S/Hr vs Store).
  | {
      kind: 'mirror';
      legend: string;
      rationale?: string;
      source: string; // sibling column name whose color this one mirrors
    };

export interface BiColumn {
  name: string;
  tier: ColumnTier;
  type: string;
  formula: string | null;
  description: string;
  flag_rule: FlagRule | null;
}

export type ImprovementPriority = 'P0' | 'P1' | 'P2';
export type ImprovementEffort = 'S' | 'M' | 'L';

// Ontology Improvement catalog item — surfaced per-BI (BiMeta.ontology_improvements)
// and per-mechanic (/api/improvements/by_mechanic/:id).
export interface OntologyImprovement {
  id: string;
  title: string;
  current_weakness: string;
  ontology_fix: string;
  output_value: string;
  how_ontology_uses: string;
  mechanic: string;
  bi_ids: string[];
  priority: ImprovementPriority;
  effort: ImprovementEffort;
  revenue_opportunity: string | null;
  depends_on: string[];
  unlocks: string[];
  capability_group: 'ingest_foundation' | 'diagnostic_chain' | 'terminal_action' | 'operational_win';
  cross_mechanic_impact: string[];
  retailer_action: string | null;
}

export interface BiMeta {
  id: string;
  label: string;
  description: string;
  upstream_plus: string[];
  takeaways: string[];
  columns: BiColumn[];
  ontology_improvements: OntologyImprovement[];
}

// /api/improvements/by_mechanic/:id response.
export interface MechanicImprovements {
  mechanic_id: string;
  improvements: OntologyImprovement[];
  contributing_bi_ids: string[];
}

// Mechanics layer — single-number-story per store, composed from BI dashboards.
// Backend source: r3-app/backend/app/mechanics/<id>.py META + compute().

export interface MechanicAlgorithmRow {
  domain: string;
  metric: string;
  green: string;
  yellow: string;
  red: string;
  reasoning: string;
}

export interface MechanicWeakness {
  rule: string;
  v2_fix: string;
}

// Diagram kinds — one per Phase 1-6. Spec shape varies; consumers branch on `kind`.
export type MechanicDiagramKind =
  | 'grid_8_domain'
  | 'waterfall'
  | 'cascade_flowchart'
  | 'store_relative_scatter'
  | 'quadrant_2d';

export interface MechanicDiagram {
  kind: MechanicDiagramKind;
  spec: {
    columns?: string[];
    // Source label for cascade-flowchart ("120 stores", etc.). Optional —
    // only cascade_flowchart consumes it.
    source_label?: string;
    // click_through shape varies by diagram kind: Grid8Domain / Waterfall
    // use `anchor_field` (drill to matching row); CascadeFlowchart uses
    // `filter_field` (drill filtered to bucket label). One or the other,
    // never both.
    click_through?: {
      target_view: 'bi';
      target_id: string;
      anchor_field?: string;
      filter_field?: string;
    };
    [key: string]: unknown;
  };
}

export interface MechanicMeta {
  id: string;
  label: string;
  deck_hook: string;
  description: string;
  upstream_bi: string[];
  utility: string;
  logic_overview: string;
  key_insights: string[];
  algorithms: MechanicAlgorithmRow[];
  weaknesses: MechanicWeakness[];
  diagram: MechanicDiagram;
  takeaways: string[];
  source_notes: string;
  // Injected at get_meta() time from the catalog.
  ontology_improvements: OntologyImprovement[];
  contributing_bi_ids: string[];
}

// /api/mechanics/{id} response — META plus mechanic-specific compute output.
// Only common fields are typed here; per-mechanic shapes (e.g. Red Count's
// `rows` + `distribution`) are typed in the page that consumes them.
export interface MechanicResponse {
  mechanic: string;
  meta: MechanicMeta;
  // Common: per-store rows. Shape varies per mechanic — see compute().
  rows?: Record<string, unknown>[];
  // Red Count specifics:
  distribution?: Record<string, number>;
  [key: string]: unknown;
}

// Home centre can toggle between two renderings.
export type HomeMode = 'ontology' | 'lineage';

// Left nav visual density — persisted in localStorage['ontology.retail.leftnav.mode'].
export type LeftNavMode = 'expanded' | 'collapsed';

// Right helper-panel state — persisted in localStorage['ontology.retail.rightpanel.mode'].
export type RightPanelMode = 'open' | 'closed';
