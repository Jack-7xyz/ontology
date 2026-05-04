// Generic source-table viewer. Paginated data grid, tier=raw coloring.
// Phase 3's Plus-table viewer will extend this with derived-column coloring.

import { useEffect, useMemo, useState } from 'react';
import { api, type SourceRows } from '../api/client';
import { FilterBar } from '../components/FilterBar';
import type { FilterField } from '../components/filter/FilterPopover';
import { createEmptyFilterState, filterRows, type FilterState } from '../lib/filters';
import { createDefaultSortState, sortRows, type SortState } from '../lib/sorting';
import { getCachedFilter, removeCachedFilter, setCachedFilter } from '../lib/filterCache';

interface Props {
  table: string;
}

const PAGE = 100;

export function SourceTable({ table }: Props) {
  const [data, setData] = useState<SourceRows | null>(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheKey = `source:${table}`;
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
      .sourceRows(table, PAGE, offset)
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

  const columns = useMemo(() => data?.columns ?? [], [data?.columns]);
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;
  const end = Math.min(offset + PAGE, total);
  const baseline = createEmptyFilterState();
  const fields = useMemo<FilterField[]>(
    () =>
      columns.map((column) => {
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
    [columns, rows],
  );
  const filtered = useMemo(() => filterRows(rows, working), [rows, working]);
  const visibleRows = useMemo(() => sortRows(filtered.rows, sort), [filtered.rows, sort]);

  if (err) return <div style={{ color: 'var(--c-flag-red)' }}>{err}</div>;
  if (!data) return <div style={{ color: 'var(--c-gray)' }}>loading {table}…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: 'var(--c-tier-raw)',
            border: '1px solid var(--c-border)',
            borderRadius: 2,
          }}
        />
        <h1 style={{ margin: 0, fontSize: 20 }}>{table}</h1>
        <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>
          Source · {columns.length} cols · {total.toLocaleString()} rows
        </span>
      </div>

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

      <Pager
        offset={offset}
        end={end}
        total={total}
        loading={loading}
        onPrev={() => setOffset(Math.max(0, offset - PAGE))}
        onNext={() => setOffset(Math.min(total - PAGE, offset + PAGE))}
      />

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
          <thead
            style={{
              position: 'sticky',
              top: 0,
              background: 'var(--c-table-head)',
              borderBottom: '1px solid var(--c-border)',
            }}
          >
            <tr>
              {columns.map((c) => (
                <th
                  key={c.name}
                  style={{
                    textAlign: c.type === 'TEXT' ? 'left' : 'right',
                    padding: '8px 10px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    borderRight: '1px solid var(--c-border)',
                  }}
                  title={`${c.name} · ${c.type}`}
                >
                  {c.name}
                  <div style={{ fontSize: 10, color: 'var(--c-gray)', fontWeight: 400 }}>{c.type}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid var(--c-border)' }}
              >
                {columns.map((c) => {
                  const v = row[c.name];
                  const isNum = c.type === 'REAL' || c.type === 'INTEGER';
                  return (
                    <td
                      key={c.name}
                      style={{
                        padding: '6px 10px',
                        textAlign: isNum ? 'right' : 'left',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        borderRight: '1px solid var(--c-border)',
                        background: 'var(--c-table-cell)',
                      }}
                    >
                      {formatCell(v, c.type)}
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

function formatCell(v: unknown, type: string): string {
  if (v === null || v === undefined) return '';
  if (type === 'REAL' && typeof v === 'number') {
    // currency-ish display for money, integer-ish for whole numbers
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (type === 'INTEGER' && typeof v === 'number') return v.toLocaleString();
  return String(v);
}
