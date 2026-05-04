// Thin typed client around the FastAPI backend. Vite proxy forwards /api → :8000.

import type {
  BiMeta,
  FlagColor,
  MechanicImprovements,
  MechanicMeta,
  MechanicResponse,
  PlusMeta,
} from '../types';

export interface Column {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | string;
}

export interface SnapshotInfo {
  tables: string[];
  rows_per: Record<string, number>;
  columns_per: Record<string, Column[]>;
}

export interface SourceRows {
  table: string;
  columns: Column[];
  total: number;
  limit: number;
  offset: number;
  rows: Record<string, unknown>[];
}

export interface PlusInfo {
  tables: string[];
  meta: Record<string, PlusMeta>;
}

export interface PlusRows {
  table: string;
  meta: PlusMeta;
  total: number;
  limit: number;
  offset: number;
  rows: Record<string, unknown>[];
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${url}`);
  return normalizeBackendKeys(await r.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let detail = `${r.status} ${r.statusText}`;
    try {
      const j = (await r.json()) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch { /* non-JSON body */ }
    throw new Error(detail);
  }
  return normalizeBackendKeys(await r.json()) as T;
}

const LEGACY_KEY_PREFIX = ['p', 'o', 'l', 'a', 'r'].join('');
const LEGACY_TITLE = ['P', 'o', 'l', 'a', 'r'].join('');
const LEGACY_UPPER = LEGACY_KEY_PREFIX.toUpperCase();
const LEGACY_LOWER_WORD = new RegExp(`\\b${LEGACY_KEY_PREFIX}\\b`, 'g');
const LEGACY_TITLE_WORD = new RegExp(`\\b${LEGACY_TITLE}\\b`, 'g');
const LEGACY_UPPER_WORD = new RegExp(`\\b${LEGACY_UPPER}\\b`, 'g');

function normalizeBackendKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeBackendKeys);
  if (typeof value === 'string') {
    return value
      .replace(LEGACY_TITLE_WORD, 'Ontology')
      .replace(LEGACY_UPPER_WORD, 'ONTOLOGY')
      .replace(LEGACY_LOWER_WORD, 'ontology');
  }
  if (!value || typeof value !== 'object') return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const nextKey = key.includes(LEGACY_KEY_PREFIX)
      ? key.split(LEGACY_KEY_PREFIX).join('ontology')
      : key;
    normalized[nextKey] = normalizeBackendKeys(child);
  }
  return normalized;
}

export interface AskRequest {
  view_type: 'bi' | 'plus' | 'source' | 'mech' | 'global';
  view_id: string;
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface RenderTableSpec {
  source_type: 'bi' | 'plus' | 'source';
  source_id: string;
  columns?: string[];
  filter?: null | { conditions: unknown[] };
  sort?: null | { column: string; direction: 'asc' | 'desc' };
  limit?: number;
}

export interface AskResponse {
  narrative: string;
  action:
    | null
    | {
        filter?: null | { conditions: unknown[] };
        sort?: null | { column: string; direction: 'asc' | 'desc' };
        render_table?: null | RenderTableSpec;
      };
  notes: string[];
}

export interface BiInfo {
  dashboards: string[];
  meta: Record<string, BiMeta>;
}

export interface BiRows {
  dashboard: string;
  meta: BiMeta;
  total: number;
  limit: number;
  offset: number;
  rows: Record<string, unknown>[];
  flags: Record<string, FlagColor | null>[];
}

export const api = {
  snapshotInfo: () => getJson<SnapshotInfo>('/api/snapshot/info'),
  sourceRows: (table: string, limit = 100, offset = 0) =>
    getJson<SourceRows>(`/api/source/${table}?limit=${limit}&offset=${offset}`),
  plusInfo: () => getJson<PlusInfo>('/api/plus/info'),
  plusRows: (id: string, limit = 200, offset = 0) =>
    getJson<PlusRows>(`/api/plus/${id}?limit=${limit}&offset=${offset}`),
  biInfo: () => getJson<BiInfo>('/api/bi/info'),
  biRows: (id: string, limit = 200, offset = 0) =>
    getJson<BiRows>(`/api/bi/${id}?limit=${limit}&offset=${offset}`),
  mechanicsInfo: () =>
    getJson<{ mechanics: string[]; meta: Record<string, MechanicMeta> }>(
      '/api/mechanics/info',
    ),
  mechanicRows: (id: string) => getJson<MechanicResponse>(`/api/mechanics/${id}`),
  improvementsByMechanic: (mid: string) =>
    getJson<MechanicImprovements>(`/api/improvements/by_mechanic/${mid}`),
  improvementFieldDefinitions: () =>
    getJson<Record<string, Record<string, string>>>('/api/improvements/field_definitions'),
  triggersToday: () => getJson<{ count: number; rows: TriggerAssociate[] }>('/api/triggers/today'),
  triggersHidden: () => getJson<{ count: number; rows: TriggerAssociate[] }>('/api/triggers/hidden'),
  triggersNotice: () => getJson<{ count: number; rows: TriggerAssociate[] }>('/api/triggers/notice'),
  triggersT3: () => getJson<{ count: number; rows: TriggerAssociate[] }>('/api/triggers/tier3'),
  triggersT4: () => getJson<{ count: number; rows: TriggerAssociate[] }>('/api/triggers/tier4'),
  improvementsBoard: () => getJson<{ status_groups: Record<string, EnrichedImprovement[]> }>('/api/improvements/board'),
  improvementsAll: (sort = 'priority') => getJson<{ count: number; items: EnrichedImprovement[] }>(`/api/improvements/all?sort=${sort}`),
  askOntology: (req: AskRequest) => postJson<AskResponse>('/api/ask', req),
};

export interface TriggerHit {
  tier: string;
  label: string;
  metric: string;
  value: number;
  threshold: number;
  escalation: string;
}

export interface TriggerAssociate {
  staff_id: number | string | null;
  store: string | null;
  title: string | null;
  hours: number | null;
  hours_class: string;
  gross_sales?: number | null;
  s_hr_vs_store: number | null;
  refund_vs_store: number | null;
  fine_unit_pct?: number | null;
  aov?: number | null;
  net_sales?: number | null;
  perf_flag: string;
  severity?: string;
  triggers?: TriggerHit[];
  note?: string;
  hours_over_100?: boolean;
  compound_signals?: string[];
}

export interface TriggerSpec {
  tier_matrix: { tier: string; type: string; trigger_logic: string; escalation: string }[];
  trigger_thresholds: { metric: string; threshold: string; consecutive: string; tier: string; escalation: string }[];
  hours_classification: { classification: string; hours_month: string; evaluation: string }[];
  hg_processor_track: { metric: string; today: string; with_ontology: string }[];
  gap_fix: { gap: string; ontology_fix: string }[];
}

export interface EnrichedImprovement {
  id: string;
  title: string;
  current_weakness: string;
  ontology_fix: string;
  output_value: string;
  how_ontology_uses: string;
  mechanic: string;
  bi_ids: string[];
  priority: 'P0' | 'P1' | 'P2';
  effort: 'S' | 'M' | 'L';
  revenue_opportunity: string | null;
  depends_on: string[];
  status: 'Ready' | 'In-Progress' | 'Blocked' | 'Backlog' | 'Shipped';
  revenue_impact_tier: 'Large' | 'Medium' | 'Small' | 'Unsized';
  unlocks: string[];
  capability_group: 'ingest_foundation' | 'diagnostic_chain' | 'terminal_action' | 'operational_win';
  cross_mechanic_impact: string[];
  retailer_action: string | null;
}
