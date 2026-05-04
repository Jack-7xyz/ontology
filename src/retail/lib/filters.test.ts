import { describe, expect, it } from 'vitest';
import type { FlagColor } from '../types';
import {
  areFilterStatesEqual,
  filterRows,
  hasFilterDiverged,
  normalizeFilterState,
} from './filters';
import {
  createEmptyFilterSession,
  createViewFilterState,
  ensureViewFilterState,
  replaceViewBaseline,
  resetViewToBaseline,
  updateViewWorkingState,
  viewHasDiverged,
} from './filterSession';

describe('filters', () => {
  const rows = [
    { store: 'Alpha', category: 'Shoes', revenue: 100, notes: 'High Value returners' },
    { store: 'Beta', category: 'Apparel', revenue: 50, notes: 'clearance rack' },
    { store: 'Gamma', category: 'Shoes', revenue: 150, notes: 'Starter bundle' },
    { store: 'Delta', category: 'Accessories', revenue: '200', notes: 'Premium add-on' },
  ];

  const flags: Array<Record<string, FlagColor | null>> = [
    { perf_flag: 'green', refund_flag: null },
    { perf_flag: 'yellow', refund_flag: null },
    { perf_flag: null, refund_flag: 'red' },
    { perf_flag: 'green', refund_flag: null },
  ];

  it('applies set filters to categorical values', () => {
    const result = filterRows(rows, {
      conditions: [{ kind: 'set', column: 'category', values: ['Shoes', 'Accessories'] }],
    });

    expect(result.indices).toEqual([0, 2, 3]);
    expect(result.rows.map((row) => row.store)).toEqual(['Alpha', 'Gamma', 'Delta']);
  });

  it('applies text filters case-insensitively', () => {
    const contains = filterRows(rows, {
      conditions: [{ kind: 'text', column: 'notes', op: 'contains', value: 'VALUE' }],
    });
    const startsWith = filterRows(rows, {
      conditions: [{ kind: 'text', column: 'notes', op: 'starts_with', value: 'starter' }],
    });
    const equals = filterRows(rows, {
      conditions: [{ kind: 'text', column: 'store', op: 'equals', value: 'delta' }],
    });

    expect(contains.rows.map((row) => row.store)).toEqual(['Alpha']);
    expect(startsWith.rows.map((row) => row.store)).toEqual(['Gamma']);
    expect(equals.rows.map((row) => row.store)).toEqual(['Delta']);
  });

  it('applies numeric operators including inclusive between', () => {
    const greaterThan = filterRows(rows, {
      conditions: [{ kind: 'number', column: 'revenue', op: '>', value: 100 }],
    });
    const between = filterRows(rows, {
      conditions: [{ kind: 'number', column: 'revenue', op: 'between', min: 100, max: 150 }],
    });
    const equals = filterRows(rows, {
      conditions: [{ kind: 'number', column: 'revenue', op: '=', value: 200 }],
    });

    expect(greaterThan.rows.map((row) => row.store)).toEqual(['Gamma', 'Delta']);
    expect(between.rows.map((row) => row.store)).toEqual(['Alpha', 'Gamma']);
    expect(equals.rows.map((row) => row.store)).toEqual(['Delta']);
  });

  it('applies flag-color filters against the flags payload', () => {
    const green = filterRows(rows, {
      conditions: [{ kind: 'flag', color: 'green' }],
    }, { flags });
    const red = filterRows(rows, {
      conditions: [{ kind: 'flag', color: 'red' }],
    }, { flags });
    const refundRed = filterRows(rows, {
      conditions: [{ kind: 'flag', color: 'red', column: 'refund_flag' }],
    }, { flags });

    expect(green.rows.map((row) => row.store)).toEqual(['Alpha', 'Delta']);
    expect(red.rows.map((row) => row.store)).toEqual(['Gamma']);
    expect(refundRed.rows.map((row) => row.store)).toEqual(['Gamma']);
  });

  it('normalizes semantically equivalent states before comparison', () => {
    const a = {
      conditions: [
        { kind: 'set' as const, column: 'category', values: ['Shoes', 'Accessories', 'Shoes'] },
        { kind: 'text' as const, column: 'store', op: 'contains' as const, value: ' Alpha ' },
      ],
    };
    const b = {
      conditions: [
        { kind: 'text' as const, column: 'store', op: 'contains' as const, value: 'Alpha' },
        { kind: 'set' as const, column: 'category', values: ['Accessories', 'Shoes'] },
      ],
    };

    expect(normalizeFilterState(a)).toEqual(normalizeFilterState(b));
    expect(areFilterStatesEqual(a, b)).toBe(true);
    expect(hasFilterDiverged(a, b)).toBe(false);
  });
});

describe('filterSession', () => {
  it('creates preset-backed baseline and working state', () => {
    const view = createViewFilterState({
      preset: {
        id: 'coverage-gap',
        label: 'Coverage Gap',
        state: {
          conditions: [{ kind: 'set', column: 'bucket', values: ['Gap'] }],
        },
      },
    });

    expect(view.baseline).toEqual(view.working);
    expect(view.preset?.label).toBe('Coverage Gap');
    expect(viewHasDiverged(view)).toBe(false);
  });

  it('preserves working state in the session store until reset', () => {
    let store = createEmptyFilterSession();
    store = ensureViewFilterState(store, 'bi:attr_gap', {
      preset: {
        id: 'coverage-gap',
        label: 'Coverage Gap',
        state: {
          conditions: [{ kind: 'set', column: 'bucket', values: ['Gap'] }],
        },
      },
    });
    store = updateViewWorkingState(store, 'bi:attr_gap', {
      conditions: [
        { kind: 'set', column: 'bucket', values: ['Gap'] },
        { kind: 'flag', color: 'red' },
      ],
    });

    expect(viewHasDiverged(store['bi:attr_gap'])).toBe(true);

    store = resetViewToBaseline(store, 'bi:attr_gap');

    expect(store['bi:attr_gap'].working).toEqual(store['bi:attr_gap'].baseline);
    expect(viewHasDiverged(store['bi:attr_gap'])).toBe(false);
  });

  it('replaces the baseline when a view is reconstructed from a new preset', () => {
    let store = createEmptyFilterSession();
    store = replaceViewBaseline(store, 'bi:perf_flag', {
      preset: {
        id: 'top-performer',
        label: 'Top Performer',
        state: {
          conditions: [{ kind: 'flag', color: 'green' }],
        },
      },
    });

    expect(store['bi:perf_flag'].baseline.conditions).toEqual([{ kind: 'flag', color: 'green' }]);
    expect(store['bi:perf_flag'].working.conditions).toEqual([{ kind: 'flag', color: 'green' }]);
  });
});
