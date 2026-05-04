export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string | null;
  direction: SortDirection;
}

type RowRecord = Record<string, unknown>;

export function createDefaultSortState(): SortState {
  return { column: null, direction: 'asc' };
}

export function sortRows<TRow extends RowRecord>(
  rows: TRow[],
  sort: SortState,
): TRow[] {
  const column = sort.column;
  if (!column) return rows;

  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(a[column], b[column]) * direction);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  const aNumber = toNumber(a);
  const bNumber = toNumber(b);
  if (aNumber !== null && bNumber !== null) {
    return aNumber - bNumber;
  }

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
