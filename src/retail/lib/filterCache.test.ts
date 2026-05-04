import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedFilter,
  setCachedFilter,
  removeCachedFilter,
  subscribeFilter,
} from './filterCache';
import type { FilterState } from './filters';

const mk = (col: string, values: string[]): FilterState => ({
  conditions: [{ kind: 'set', column: col, values }],
});

describe('filterCache pub/sub', () => {
  afterEach(() => {
    // Clean up any keys used in tests to avoid cross-test pollution.
    removeCachedFilter('test:a');
    removeCachedFilter('test:b');
  });

  it('notifies subscribers on setCachedFilter with origin', () => {
    const cb = vi.fn();
    const unsub = subscribeFilter('test:a', cb);
    setCachedFilter('test:a', mk('store', ['X']), 'ask-ontology');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].conditions[0]).toMatchObject({ column: 'store' });
    expect(cb.mock.calls[0][1]).toBe('ask-ontology');
    unsub();
  });

  it('defaults origin to "local"', () => {
    const cb = vi.fn();
    const unsub = subscribeFilter('test:a', cb);
    setCachedFilter('test:a', mk('c', ['v']));
    expect(cb.mock.calls[0][1]).toBe('local');
    unsub();
  });

  it('subscribe scoped to viewKey — other keys do not fire', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    subscribeFilter('test:a', cbA);
    subscribeFilter('test:b', cbB);
    setCachedFilter('test:a', mk('c', ['v']), 'local');
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further notifications', () => {
    const cb = vi.fn();
    const unsub = subscribeFilter('test:a', cb);
    setCachedFilter('test:a', mk('c', ['v']), 'local');
    unsub();
    setCachedFilter('test:a', mk('c', ['w']), 'local');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('removeCachedFilter notifies with origin "clear"', () => {
    const cb = vi.fn();
    const unsub = subscribeFilter('test:a', cb);
    setCachedFilter('test:a', mk('c', ['v']), 'local');
    removeCachedFilter('test:a');
    expect(cb.mock.calls.at(-1)?.[1]).toBe('clear');
    unsub();
  });

  it('subscriber throw does not break other subscribers', () => {
    const errCb = vi.fn(() => {
      throw new Error('boom');
    });
    const goodCb = vi.fn();
    const suppress = vi.spyOn(console, 'error').mockImplementation(() => {});
    subscribeFilter('test:a', errCb);
    subscribeFilter('test:a', goodCb);
    setCachedFilter('test:a', mk('c', ['v']), 'local');
    expect(errCb).toHaveBeenCalled();
    expect(goodCb).toHaveBeenCalled();
    suppress.mockRestore();
  });

  it('getCachedFilter returns empty state by default', () => {
    const s = getCachedFilter('test:nonexistent');
    expect(s.conditions).toEqual([]);
  });
});
