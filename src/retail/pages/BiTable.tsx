// BI dashboard viewer — mirrors PlusTable skeleton (description row + tier headers +
// ƒ formula sub-row) PLUS per-cell G/Y/R chips driven by server-computed flags, plus
// a top "threshold legend" block listing every flagged column's rule in plain English.

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type BiRows } from '../api/client';
import { FilterBar } from '../components/FilterBar';
import type { FilterField } from '../components/filter/FilterPopover';
import { createViewFilterState, resetViewToBaseline, updateViewWorkingState, type FilterSessionStore } from '../lib/filterSession';
import { createEmptyFilterState, filterRows, type FilterPreset, type FilterState } from '../lib/filters';
import { sortRows, type SortState } from '../lib/sorting';
import { getCachedFilter, removeCachedFilter, setCachedFilter } from '../lib/filterCache';
import { getCachedSort } from '../lib/sortCache';
import type { BiColumn, ColumnTier, FlagColor } from '../types';
import { useShowFormulas, FormulaToggleButton } from '../hooks/useShowFormulas';
import { useExternalFilterSort } from '../hooks/useExternalFilterSort';

interface Props {
  id: string;
  // Optional row identifier (matched against the first TEXT column). When
  // provided, the table scrolls that row into view and briefly highlights it.
  // Used by mechanic-page diagrams to drill from a click into the matching
  // BI row.
  anchor?: string;
  // Optional categorical filter. When provided, rows are filtered client-side
  // to those whose named categorical column equals this value, and a
  // dismissable filter banner is shown above the table. Used by
  // cascade-flowchart bucket click-through (attr_gap's primary_flag,
  // perf_flag_cascade's perf_flag column).
  filterField?: string;
  filter?: string;
}

const PAGE = 200;
const FULL_FETCH = 5000;

const TIER_BG: Record<ColumnTier, string> = {
  raw: 'var(--c-tier-raw)',
  tab_derived: 'var(--c-tier-tab-derived)',
  bi_derived: 'var(--c-tier-bi-derived)',
};

const TIER_LABEL: Record<ColumnTier, string> = {
  raw: 'Raw Origin',
  tab_derived: 'Tab+ Derived',
  bi_derived: 'BI Derived',
};

const FLAG_COLOR: Record<FlagColor, string> = {
  green: 'var(--c-flag-green)',
  yellow: 'var(--c-flag-yellow)',
  red: 'var(--c-flag-red)',
};

export function BiTable({ id, anchor, filterField, filter }: Props) {
  const [data, setData] = useState<BiRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFormulas, toggleFormulas] = useShowFormulas();
  const cacheKey = `bi:${id}`;
  const [viewState, setViewStateRaw] = useState(() =>
    buildInitialViewState(filterField, filter, getCachedFilter(cacheKey)),
  );
  const [sort, setSort] = useState<SortState>(() => getCachedSort(cacheKey));

  // Mirror working filter → cache on every state change. baseline/preset are
  // derived from drill-in props; we cache the user's working state so
  // tab-switching back to this dashboard restores their filters.
  function setViewState(next: ReturnType<typeof buildInitialViewState> | ((prev: ReturnType<typeof buildInitialViewState>) => ReturnType<typeof buildInitialViewState>)) {
    setViewStateRaw((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: typeof prev) => typeof prev)(prev) : next;
      setCachedFilter(cacheKey, resolved.working);
      return resolved;
    });
  }
  // Row id we're currently flashing (clears after 1.6s). Drives the temporary
  // highlight class on the matching <tr>. State (not just a ref) so the
  // highlight re-renders.
  const [flashRowKey, setFlashRowKey] = useState<string | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [id]);

  useEffect(() => {
    const next = buildInitialViewState(filterField, filter, getCachedFilter(cacheKey));
    setCachedFilter(cacheKey, next.working);
    setViewStateRaw(next);
    setSort(getCachedSort(cacheKey));
  }, [cacheKey, filterField, filter]);

  useExternalFilterSort(
    cacheKey,
    (newFilter) => setViewState((prev) => ({ ...prev, working: newFilter })),
    (newSort) => setSort(newSort),
  );

  const needsFullDataset = Boolean(anchor || filter || viewState.working.conditions.length > 0);
  const queryLimit = needsFullDataset ? FULL_FETCH : PAGE;
  const queryOffset = needsFullDataset ? 0 : offset;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api
      .biRows(id, queryLimit, queryOffset)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, queryLimit, queryOffset]);

  // Anchor scroll: after rows render, find the row whose first TEXT column
  // equals `anchor`, scrollIntoView, and flash it for 1.6s. Re-runs on
  // anchor / data change. Drill-in views fetch the full BI dataset so the
  // anchor can resolve even when the matching row is outside the first page.
  useEffect(() => {
    if (!anchor || !data) return;
    const idCol = data.meta.columns.find((c) => c.type === 'TEXT')?.name;
    if (!idCol) return;
    const idx = data.rows.findIndex((r) => String(r[idCol] ?? '') === anchor);
    if (idx === -1) return;
    const localIdx = idx - queryOffset;
    const tr = tbodyRef.current?.querySelectorAll('tr')?.[localIdx];
    if (tr) {
      tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlashRowKey(`${idx}`);
      const t = setTimeout(() => setFlashRowKey(null), 1600);
      return () => clearTimeout(t);
    }
  }, [anchor, data, queryOffset]);

  const meta = data?.meta;
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const flags = useMemo(() => data?.flags ?? [], [data?.flags]);
  const total = data?.total ?? 0;
  const end = Math.min(queryOffset + queryLimit, total);
  const biDerivedCount = meta?.columns.filter((c) => c.tier === 'bi_derived').length ?? 0;
  const flaggedCols = meta?.columns.filter((c) => c.flag_rule !== null) ?? [];
  const fields = useMemo<FilterField[]>(
    () => [
      ...(meta?.columns ?? []).map((column) => {
        const values = Array.from(new Set(rows.map((row) => String(row[column.name] ?? '')))).sort();
        const kind = inferFieldKind(column.name, column.type, values);
        return {
          key: column.name,
          label: column.name,
          kind,
          options: kind === 'set' ? values : undefined,
          textSuggestions: kind === 'text' ? getTextSuggestions(values) : undefined,
          flagColumn: column.flag_rule ? column.name : undefined,
        };
      }),
    ],
    [meta?.columns, rows],
  );
  const filtered = useMemo(
    () => filterRows(rows, viewState.working, { flags }),
    [flags, rows, viewState.working],
  );
  const visibleRows = useMemo(() => sortRows(filtered.rows, sort), [filtered.rows, sort]);

  if (err) return <div style={{ color: 'var(--c-flag-red)' }}>{err}</div>;
  if (!data || !meta) return <div style={{ color: 'var(--c-gray)' }}>loading {id}…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: TIER_BG.bi_derived,
            border: '1px solid #7FCFA8',
            borderRadius: 2,
          }}
        />
        <h1 style={{ margin: 0, fontSize: 20 }}>{meta.label}</h1>
        <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>
          BI Dashboard · upstream: {meta.upstream_plus.length} Plus tabs · {biDerivedCount} bi-derived · {total.toLocaleString()} rows
        </span>
      </div>
      <div style={{ color: 'var(--c-white)', fontSize: 13, lineHeight: 1.4, maxWidth: 900 }}>
        {meta.description}
      </div>

      <TierLegend />
      {flaggedCols.length > 0 && <ThresholdLegend columns={flaggedCols} />}

      <FilterBar
        fields={fields}
        baseline={viewState.baseline}
        working={viewState.working}
        preset={viewState.preset}
        showingCount={filtered.rows.length}
        totalCount={rows.length}
        sort={sort}
        onSortChange={setSort}
        onChange={(next: FilterState) => {
          const store: FilterSessionStore = { current: viewState };
          setViewState(updateViewWorkingState(store, 'current', next).current);
        }}
        onClearAll={() => {
          removeCachedFilter(cacheKey);
          setViewStateRaw({ ...viewState, working: createEmptyFilterState() });
        }}
        onResetToPreset={() => {
          const store: FilterSessionStore = { current: viewState };
          setViewState(resetViewToBaseline(store, 'current').current);
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Pager
          offset={queryOffset}
          end={end}
          total={total}
          loading={loading}
          onPrev={() => setOffset(Math.max(0, offset - PAGE))}
          onNext={() => setOffset(Math.min(total - PAGE, offset + PAGE))}
          disablePaging={needsFullDataset}
        />
        <span style={{ flex: 1 }} />
        <FormulaToggleButton show={showFormulas} onToggle={toggleFormulas} />
      </div>

      {/* Table */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          borderRadius: 6,
        }}
      >
        <table style={{ borderCollapse: 'collapse', borderSpacing: 0, fontSize: 12, width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            {/* Description row — hidden when header is compact */}
            {showFormulas && (
              <tr>
                {meta.columns.map((c) => (
                  <th
                    key={`desc-${c.name}`}
                    style={{
                      background: TIER_BG[c.tier],
                      borderBottom: '1px solid var(--c-border)',
                      borderRight: '1px solid var(--c-border)',
                      padding: '6px 10px 4px',
                      fontWeight: 400,
                      fontSize: 10,
                      fontStyle: 'italic',
                      color: 'var(--c-gray)',
                      verticalAlign: 'top',
                      minWidth: 120,
                      maxWidth: 240,
                      whiteSpace: 'normal',
                      lineHeight: 1.3,
                      textAlign: 'left',
                    }}
                  >
                    {c.description}
                  </th>
                ))}
              </tr>
            )}
            {/* Column-name row + formula + flag legend */}
            <tr>
              {meta.columns.map((c) => {
                const isNum = c.type === 'REAL' || c.type === 'INTEGER';
                return (
                  <th
                    key={c.name}
                    style={{
                      background: TIER_BG[c.tier],
                      borderBottom: '2px solid var(--c-border)',
                      borderRight: '1px solid var(--c-border)',
                      padding: '6px 10px 8px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      textAlign: isNum ? 'right' : 'left',
                      verticalAlign: 'top',
                    }}
                    title={`${c.name} · ${c.type} · ${TIER_LABEL[c.tier]}${c.formula ? ` · ${c.formula}` : ''}`}
                  >
                    <div>{c.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--c-gray)', fontWeight: 400, marginTop: 2 }}>
                      {c.type}
                    </div>
                    {showFormulas && c.formula && (
                      <div
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                          fontSize: 10,
                          color: 'var(--c-teal)',
                          fontWeight: 500,
                          marginTop: 4,
                          padding: '2px 4px',
                          background: 'rgba(134,198,202,0.14)',
                          borderRadius: 3,
                          whiteSpace: 'normal',
                          textAlign: 'left',
                          lineHeight: 1.35,
                        }}
                      >
                        ƒ {c.formula}
                      </div>
                    )}
                    {c.flag_rule && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 9,
                          color: 'var(--c-gray)',
                          fontWeight: 400,
                          fontStyle: 'italic',
                          whiteSpace: 'normal',
                          textAlign: 'left',
                          lineHeight: 1.3,
                        }}
                      >
                        {c.flag_rule.legend}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {visibleRows.map((row) => {
              const sourceIndex = rows.indexOf(row);
              const rowFlags = flags[sourceIndex] ?? {};
              const globalIdx = queryOffset + sourceIndex;
              const isFlash = flashRowKey === `${globalIdx}`;
              return (
                <tr
                  key={sourceIndex}
                  style={{
                    borderBottom: '1px solid var(--c-border)',
                    background: isFlash ? 'rgba(245,197,66,0.20)' : undefined,
                    transition: 'background 600ms ease',
                  }}
                >
                  {meta.columns.map((c) => {
                    const v = row[c.name];
                    const isNum = c.type === 'REAL' || c.type === 'INTEGER';
                    const color = rowFlags[c.name] ?? null;
                    const cellBg =
                      c.tier === 'tab_derived'
                        ? 'rgba(23,69,106,0.32)'
                        : c.tier === 'bi_derived'
                          ? 'rgba(134,198,202,0.22)'
                          : 'var(--c-table-cell)';
                    return (
                      <td
                        key={c.name}
                        style={{
                          padding: '6px 10px',
                          textAlign: isNum ? 'right' : 'left',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid var(--c-border)',
                          background: cellBg,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            justifyContent: isNum ? 'flex-end' : 'flex-start',
                            width: '100%',
                          }}
                        >
                          <span>{formatCell(v, c)}</span>
                          {color && (
                            <span
                              title={`flag: ${color}`}
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 3,
                                background: FLAG_COLOR[color],
                                flexShrink: 0,
                                boxShadow: '0 0 0 0.5px rgba(0,0,0,0.25) inset',
                              }}
                            />
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function inferFieldKind(name: string, type: string, values: string[]): FilterField['kind'] {
  if (type === 'REAL' || type === 'INTEGER') return 'number';

  const normalized = name.toLocaleLowerCase();
  const nonEmptyValues = values.filter(Boolean);
  const hasCompositeValues = nonEmptyValues.some((value) => value.includes(','));
  const highCardinality = nonEmptyValues.length > 20;
  const forceText = /(^|_)(id|store|name|domain|email|sku|associate|employee)(_|$)/.test(normalized);

  if (hasCompositeValues || highCardinality || forceText) return 'text';
  return 'set';
}

function getTextSuggestions(values: string[]): string[] {
  const compositeTokens = values.flatMap((value) => value.split(',').map((token) => token.trim()).filter(Boolean));
  const pool = compositeTokens.length > values.length ? compositeTokens : values.filter(Boolean);
  return Array.from(new Set(pool)).sort();
}

function buildInitialViewState(filterField?: string, filter?: string, cachedWorking?: FilterState) {
  const preset: FilterPreset | null = filterField && filter
    ? {
        id: `${filterField}:${filter}`,
        label: `${filterField} = ${filter}`,
        state: {
          conditions: [{ kind: 'set', column: filterField, values: [filter] }],
        },
      }
    : null;

  const baseline = preset?.state ?? createEmptyFilterState();
  // Drill-in override: when arriving with a preset (mechanic → BI redirect),
  // the preset wins over the cache. Otherwise, restore the user's cached
  // working state so tab-switching preserves filters.
  const working = preset
    ? preset.state
    : cachedWorking && cachedWorking.conditions.length > 0
      ? cachedWorking
      : baseline;
  return createViewFilterState({ preset, baseline, working });
}

function TierLegend() {
  return (
    <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--c-gray)', alignItems: 'center' }}>
      <span style={{ fontWeight: 600, letterSpacing: 0.4 }}>LINEAGE TIER</span>
      <Swatch bg={TIER_BG.raw} label="Raw Origin" />
      <Swatch bg={TIER_BG.tab_derived} label="Tab+ Derived" />
      <Swatch bg={TIER_BG.bi_derived} label="BI Derived" />
    </div>
  );
}

function ThresholdLegend({ columns }: { columns: BiColumn[] }) {
  return (
    <div
      style={{
        background: 'rgba(134,198,202,0.14)',
        border: '1px solid var(--c-border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 11,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 18px',
        alignItems: 'center',
      }}
    >
      <span style={{ fontWeight: 700, letterSpacing: 0.4, color: 'var(--c-gray)' }}>FLAG RULES</span>
      {columns.map((c) => (
        <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FlagChips />
          <strong style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>{c.name}</strong>
          <span style={{ color: 'var(--c-gray)' }}>{c.flag_rule?.legend}</span>
        </span>
      ))}
    </div>
  );
}

function FlagChips() {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <span style={{ width: 8, height: 8, background: FLAG_COLOR.green, borderRadius: 2 }} />
      <span style={{ width: 8, height: 8, background: FLAG_COLOR.yellow, borderRadius: 2 }} />
      <span style={{ width: 8, height: 8, background: FLAG_COLOR.red, borderRadius: 2 }} />
    </span>
  );
}

function Swatch({ bg, label }: { bg: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          background: bg,
          border: '1px solid var(--c-border)',
          borderRadius: 2,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}

function Pager({
  offset,
  end,
  total,
  loading,
  disablePaging,
  onPrev,
  onNext,
}: {
  offset: number;
  end: number;
  total: number;
  loading: boolean;
  disablePaging?: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <button onClick={onPrev} disabled={disablePaging || offset === 0} style={btn}>
        ← prev
      </button>
      <button onClick={onNext} disabled={disablePaging || end >= total} style={btn}>
        next →
      </button>
      <span style={{ color: 'var(--c-gray)' }}>
        {offset + 1}–{end} of {total.toLocaleString()}
        {disablePaging ? ' · drill-in view' : ''}
        {loading ? ' · loading…' : ''}
      </span>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: 'var(--c-panel-2)',
  border: '1px solid var(--c-border)',
  color: 'var(--c-white)',
  padding: '5px 12px',
  borderRadius: 4,
  fontSize: 12,
};

// Cell formatting — same heuristic as PlusTable plus BI-specific column names.
function formatCell(v: unknown, c: { name: string; type: string }): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return String(v);

  const n = c.name;
  // Absolute-percent columns: stored as whole numbers where 105 means 105%.
  // Do NOT apply the ×100 decimal-to-percent conversion.
  const isAbsPct =
    n === 'payroll_budget_pct' ||
    n === 'payroll_max_week_pct';
  const isPct =
    !isAbsPct && (
      n === 'cvr' ||
      n === 'gc_return_ratio' ||
      // includes('_pct') catches both suffix (_pct) and infix (_pct_of_gap).
      n.includes('_pct') ||
      n.endsWith('_rate') ||
      n === 'yoy_growth' ||
      // HG Intel + Ops Compliance inventory variance: stored as fraction (-0.047 = -4.7%)
      n === 'inv_variance' ||
      n === 'inventory_variance'
    );
  const isCurrency =
    n === 'aov' ||
    n === 'gross_sales' ||
    n === 'net_sales' ||
    n === 'ontology_net_sales' ||
    n === 'discounts' ||
    n === 'returns' ||
    n === 'rev_per_labor_hour' ||
    n === 'endear_rpm' ||
    // Attribution Intel currency cols
    n === 'store_gross' ||
    n === 'staff_gross' ||
    n === 'gap_d' ||
    n === 'est_gc_rev' ||
    n === 'refund_gap_d' ||
    // Fine-Mix Intel currency cols
    n === 'store_aov' ||
    n === 'fine_net_sales' ||
    n === 'fine_aov' ||
    n === 'opportunity_d' ||
    // Associate Performance cols L backfill
    n === 'est_fine_rev' ||
    // HG Intel currency cols
    n === 'est_gc_revenue' ||
    n === 'deduped_gross' ||
    n === 'ontology_net_revenue';
  // One-decimal ratio cols (sheet #,##0.0 format)
  const isDecimalOne =
    n === 'traffic_per_staff' ||
    // Fine-Mix z-scores (sheet displays 1-decimal, can be negative)
    n === 'mix_sigma' ||
    n === 'aov_sigma' ||
    // Visual Score composite (sheet displays 1-decimal, 1.0/2.0/3.0)
    n === 'visual_score';

  if (isAbsPct) return `${v.toFixed(1)}%`;
  if (isPct) return `${(v * 100).toFixed(1)}%`;
  if (isCurrency)
    return v.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: v >= 1000 ? 0 : 2,
    });
  if (isDecimalOne)
    return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (c.type === 'INTEGER') return v.toLocaleString();
  if (c.type === 'REAL') {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return v.toLocaleString();
}
