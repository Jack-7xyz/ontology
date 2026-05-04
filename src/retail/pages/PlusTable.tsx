// Plus tab viewer — paginated, tier-colored headers, description row above headers,
// formula sub-row under derived column names. Column order from META (matches Jack's spec 1:1).

import { useEffect, useMemo, useState } from 'react';
import { api, type PlusRows } from '../api/client';
import { FilterBar } from '../components/FilterBar';
import type { FilterField } from '../components/filter/FilterPopover';
import type { ColumnTier } from '../types';
import { useShowFormulas, FormulaToggleButton } from '../hooks/useShowFormulas';
import { createEmptyFilterState, filterRows, type FilterState } from '../lib/filters';
import { createDefaultSortState, sortRows, type SortState } from '../lib/sorting';
import { getCachedFilter, removeCachedFilter, setCachedFilter } from '../lib/filterCache';

interface Props {
  table: string;
}

const PAGE = 200;

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

export function PlusTable({ table }: Props) {
  const [data, setData] = useState<PlusRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFormulas, toggleFormulas] = useShowFormulas();
  const cacheKey = `plus:${table}`;
  const [working, setWorkingState] = useState<FilterState>(() => getCachedFilter(cacheKey));
  const [sort, setSort] = useState<SortState>(createDefaultSortState);

  function setWorking(next: FilterState | ((prev: FilterState) => FilterState)) {
    setWorkingState((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: FilterState) => FilterState)(prev) : next;
      setCachedFilter(cacheKey, resolved);
      return resolved;
    });
  }

  useEffect(() => {
    setOffset(0);
    setWorkingState(getCachedFilter(cacheKey));
    setSort(createDefaultSortState());
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api
      .plusRows(table, PAGE, offset)
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
  }, [table, offset]);

  const meta = data?.meta;
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;
  const end = Math.min(offset + PAGE, total);
  const derivedCount = meta?.columns.filter((c) => c.tier === 'tab_derived').length ?? 0;
  const sourceCount = meta?.columns.filter((c) => c.tier === 'raw').length ?? 0;
  const baseline = createEmptyFilterState();
  const fields = useMemo<FilterField[]>(
    () =>
      (meta?.columns ?? []).map((column) => {
        const values = Array.from(new Set(rows.map((row) => String(row[column.name] ?? '')))).sort();
        const kind = inferFieldKind(column.name, column.type, values);
        return {
          key: column.name,
          label: column.name,
          kind,
          options: kind === 'set' ? values : undefined,
          textSuggestions: kind === 'text' ? getTextSuggestions(values) : undefined,
        };
      }),
    [meta?.columns, rows],
  );
  const filtered = useMemo(() => filterRows(rows, working), [rows, working]);
  const visibleRows = useMemo(() => sortRows(filtered.rows, sort), [filtered.rows, sort]);

  if (err) return <div style={{ color: 'var(--c-flag-red)' }}>{err}</div>;
  if (!data || !meta) return <div style={{ color: 'var(--c-gray)' }}>loading {table}+…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: TIER_BG.tab_derived,
            border: '1px solid #C7C2F0',
            borderRadius: 2,
          }}
        />
        <h1 style={{ margin: 0, fontSize: 20 }}>{meta.label}</h1>
        <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>
          Plus (staging) · src: <code>{meta.source_table}</code> ·{' '}
          {sourceCount} raw + {derivedCount} derived · {total.toLocaleString()} rows
        </span>
      </div>
      <div style={{ color: 'var(--c-white)', fontSize: 13, lineHeight: 1.4, maxWidth: 900 }}>
        {meta.description}
      </div>
      <Legend />

      <FilterBar
        fields={fields}
        baseline={baseline}
        working={working}
        showingCount={filtered.rows.length}
        totalCount={rows.length}
        sort={sort}
        onSortChange={setSort}
        onChange={setWorking}
        onClearAll={() => {
          removeCachedFilter(cacheKey);
          setWorkingState(createEmptyFilterState());
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Pager
          offset={offset}
          end={end}
          total={total}
          loading={loading}
          onPrev={() => setOffset(Math.max(0, offset - PAGE))}
          onNext={() => setOffset(Math.min(total - PAGE, offset + PAGE))}
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
            {/* Column-name row + formula sub-row for derived */}
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
                    <div
                      style={{
                        fontSize: 9,
                        color: 'var(--c-gray)',
                        fontWeight: 400,
                        marginTop: 2,
                      }}
                    >
                      {c.type}
                    </div>
                    {showFormulas && c.formula && (
                      <div
                        style={{
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
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
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                {meta.columns.map((c) => {
                  const v = row[c.name];
                  const isNum = c.type === 'REAL' || c.type === 'INTEGER';
                  // Light tint on derived cells so column tier reads at a glance
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
                      {formatCell(v, c)}
                    </td>
                  );
                })}
              </tr>
            ))}
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

function Legend() {
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        fontSize: 11,
        color: 'var(--c-gray)',
        alignItems: 'center',
      }}
    >
      <span style={{ fontWeight: 600, letterSpacing: 0.4 }}>LINEAGE TIER</span>
      <Swatch bg={TIER_BG.raw} label="Raw Origin" />
      <Swatch bg={TIER_BG.tab_derived} label="Tab+ Derived" />
      <Swatch bg={TIER_BG.bi_derived} label="BI Derived" />
    </div>
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
  onPrev,
  onNext,
}: {
  offset: number;
  end: number;
  total: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
      <button onClick={onPrev} disabled={offset === 0} style={btn}>
        ← prev
      </button>
      <button onClick={onNext} disabled={end >= total} style={btn}>
        next →
      </button>
      <span style={{ color: 'var(--c-gray)' }}>
        {offset + 1}–{end} of {total.toLocaleString()}
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

// Cell formatting — type-aware. Special cases:
//   - *_pct, *_rate, *_mix_pct, return_rate, refund_rate, fine_mix_pct, discrepancy_pct → render as %
//   - cvr → render as %
//   - aov, gross_*, net_sales, est_revenue_impact → render as $ currency
function formatCell(v: unknown, c: { name: string; type: string }): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return String(v);

  const n = c.name;
  // Absolute-percent columns: stored as whole numbers where 105 means 105%.
  // Do NOT apply the ×100 decimal-to-percent conversion.
  const isAbsPct =
    n === 'avg_budget_pct' ||
    n === 'max_week_pct' ||
    n.startsWith('payroll_budget_week_');
  const isPct =
    !isAbsPct && (
      n === 'cvr' ||
      n.endsWith('_rate') ||
      n.endsWith('_pct') ||
      n === 'inventory_variance' ||
      n === 'fine_mix_pct'
    );
  const isCurrency =
    n === 'aov' ||
    n === 'sales_per_hour' ||
    n === 'net_sales' ||
    n === 'endear_rpm' ||
    n === 'est_revenue_impact' ||
    n.endsWith('_gross_sales') ||
    n.endsWith('_discounts') ||
    n.endsWith('_returns') ||
    n.endsWith('_net_sales') ||
    n === 'cash_expected' ||
    n === 'cash_discrepancy' ||
    n === 'gross_sales' ||
    n === 'discounts' ||
    n === 'refunds';

  if (isAbsPct) return `${v.toFixed(1)}%`;
  if (isPct) return `${(v * 100).toFixed(1)}%`;
  if (isCurrency)
    return v.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: v >= 1000 ? 0 : 2,
    });
  if (c.type === 'REAL') {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return v.toLocaleString();
}
