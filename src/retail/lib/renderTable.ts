import type { Column, RenderTableSpec } from '../api/client';
import type { FlagColor } from '../types';
import { createEmptyFilterState, filterRows, type FilterState } from './filters';
import { createDefaultSortState, sortRows, type SortState } from './sorting';

export interface RenderTableDataset {
  columns: Column[];
  rows: Record<string, unknown>[];
  flags?: Array<Record<string, FlagColor | null>>;
}

export interface MaterializedRenderTable {
  columns: Column[];
  rows: Record<string, unknown>[];
}

export function materializeRenderTable(
  dataset: RenderTableDataset,
  spec: RenderTableSpec,
): MaterializedRenderTable {
  const filterState = (spec.filter as FilterState | null | undefined) ?? createEmptyFilterState();
  const sortState = (spec.sort as SortState | null | undefined) ?? createDefaultSortState();
  const filtered = filterRows(dataset.rows, filterState, { flags: dataset.flags });
  const sorted = sortRows(filtered.rows, sortState);
  const columns = selectColumns(dataset.columns, spec.columns);
  const limit = spec.limit ?? 50;
  const rows = sorted
    .slice(0, limit)
    .map((row) => projectRow(row, columns));

  return { columns, rows };
}

function selectColumns(columns: Column[], names?: string[]): Column[] {
  if (!names || names.length === 0) return columns;
  const byName = new Map(columns.map((column) => [column.name, column]));
  return names.flatMap((name) => {
    const column = byName.get(name);
    return column ? [column] : [];
  });
}

function projectRow(row: Record<string, unknown>, columns: Column[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns) out[column.name] = row[column.name];
  return out;
}
