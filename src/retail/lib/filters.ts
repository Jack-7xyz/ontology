import type { FlagColor } from '../types';

export type NumberFilterOp = '=' | '>' | '>=' | '<' | '<=' | 'between';
export type TextFilterOp = 'contains' | 'equals' | 'starts_with';

export type FilterCondition =
  | { kind: 'set'; column: string; values: string[] }
  | { kind: 'text'; column: string; op: TextFilterOp; value: string }
  | { kind: 'number'; column: string; op: NumberFilterOp; value?: number; min?: number; max?: number }
  | { kind: 'flag'; color: FlagColor; column?: string };

export interface FilterState {
  conditions: FilterCondition[];
}

export interface FilterPreset {
  id: string;
  label: string;
  state: FilterState;
}

export interface ApplyFilterOptions {
  flags?: Array<Record<string, FlagColor | null | undefined>>;
}

export interface FilteredRowsResult<TRow> {
  rows: TRow[];
  indices: number[];
}

type RowRecord = Record<string, unknown>;

export function createEmptyFilterState(): FilterState {
  return { conditions: [] };
}

export function cloneFilterState(state: FilterState): FilterState {
  return {
    conditions: state.conditions.map(cloneCondition),
  };
}

export function normalizeFilterState(state: FilterState): FilterState {
  const normalized = state.conditions
    .map(normalizeCondition)
    .filter((condition): condition is FilterCondition => condition !== null)
    .sort(compareConditions);

  return { conditions: normalized };
}

export function serializeFilterState(state: FilterState): string {
  return JSON.stringify(normalizeFilterState(state));
}

export function areFilterStatesEqual(a: FilterState, b: FilterState): boolean {
  return serializeFilterState(a) === serializeFilterState(b);
}

export function hasFilterDiverged(baseline: FilterState, working: FilterState): boolean {
  return !areFilterStatesEqual(baseline, working);
}

export function filterRows<TRow extends RowRecord>(
  rows: TRow[],
  state: FilterState,
  options: ApplyFilterOptions = {},
): FilteredRowsResult<TRow> {
  const normalized = normalizeFilterState(state);
  const indices: number[] = [];
  const filteredRows: TRow[] = [];

  rows.forEach((row, index) => {
    const flagRow = options.flags?.[index];
    if (normalized.conditions.every((condition) => matchesCondition(row, condition, flagRow))) {
      indices.push(index);
      filteredRows.push(row);
    }
  });

  return { rows: filteredRows, indices };
}

export function getFilteredRowIndices(
  rows: RowRecord[],
  state: FilterState,
  options: ApplyFilterOptions = {},
): number[] {
  return filterRows(rows, state, options).indices;
}

export function matchesCondition(
  row: RowRecord,
  condition: FilterCondition,
  flagRow?: Record<string, FlagColor | null | undefined>,
): boolean {
  switch (condition.kind) {
    case 'set':
      return matchesSetCondition(row, condition);
    case 'text':
      return matchesTextCondition(row, condition);
    case 'number':
      return matchesNumberCondition(row, condition);
    case 'flag':
      return matchesFlagCondition(condition, flagRow);
  }
}

function matchesSetCondition(row: RowRecord, condition: Extract<FilterCondition, { kind: 'set' }>): boolean {
  const values = new Set(condition.values);
  return values.has(stringifyValue(row[condition.column]));
}

function matchesTextCondition(row: RowRecord, condition: Extract<FilterCondition, { kind: 'text' }>): boolean {
  const haystack = stringifyValue(row[condition.column]).toLocaleLowerCase();
  const needle = condition.value.toLocaleLowerCase();

  switch (condition.op) {
    case 'contains':
      return haystack.includes(needle);
    case 'equals':
      return haystack === needle;
    case 'starts_with':
      return haystack.startsWith(needle);
  }
}

function matchesNumberCondition(row: RowRecord, condition: Extract<FilterCondition, { kind: 'number' }>): boolean {
  const numericValue = toNumber(row[condition.column]);
  if (numericValue === null) return false;

  switch (condition.op) {
    case '=':
      return numericValue === condition.value;
    case '>':
      return numericValue > (condition.value ?? Number.NaN);
    case '>=':
      return numericValue >= (condition.value ?? Number.NaN);
    case '<':
      return numericValue < (condition.value ?? Number.NaN);
    case '<=':
      return numericValue <= (condition.value ?? Number.NaN);
    case 'between':
      return numericValue >= (condition.min ?? Number.POSITIVE_INFINITY * -1) &&
        numericValue <= (condition.max ?? Number.POSITIVE_INFINITY);
  }
}

function matchesFlagCondition(
  condition: Extract<FilterCondition, { kind: 'flag' }>,
  flagRow?: Record<string, FlagColor | null | undefined>,
): boolean {
  if (!flagRow) return false;
  if (condition.column) return flagRow[condition.column] === condition.color;
  return Object.values(flagRow).some((value) => value === condition.color);
}

function normalizeCondition(condition: FilterCondition): FilterCondition | null {
  switch (condition.kind) {
    case 'set': {
      const values = Array.from(new Set(condition.values.map((value) => value.trim()).filter(Boolean))).sort();
      if (!condition.column.trim() || values.length === 0) return null;
      return { kind: 'set', column: condition.column, values };
    }
    case 'text': {
      const value = condition.value.trim();
      if (!condition.column.trim() || !value) return null;
      return { kind: 'text', column: condition.column, op: condition.op, value };
    }
    case 'number': {
      if (!condition.column.trim()) return null;
      if (condition.op === 'between') {
        if (!Number.isFinite(condition.min) || !Number.isFinite(condition.max)) return null;
        const min = Number(condition.min);
        const max = Number(condition.max);
        return {
          kind: 'number',
          column: condition.column,
          op: condition.op,
          min: Math.min(min, max),
          max: Math.max(min, max),
        };
      }

      if (!Number.isFinite(condition.value)) return null;
      return { kind: 'number', column: condition.column, op: condition.op, value: Number(condition.value) };
    }
    case 'flag':
      return condition;
  }
}

function compareConditions(a: FilterCondition, b: FilterCondition): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function cloneCondition(condition: FilterCondition): FilterCondition {
  switch (condition.kind) {
    case 'set':
      return { ...condition, values: [...condition.values] };
    case 'text':
      return { ...condition };
    case 'number':
      return { ...condition };
    case 'flag':
      return { ...condition };
  }
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
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
