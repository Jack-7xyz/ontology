import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedSort,
  removeCachedSort,
  setCachedSort,
  subscribeSort,
} from './sortCache';

describe('sortCache pub/sub', () => {
  afterEach(() => {
    removeCachedSort('test:a');
    removeCachedSort('test:b');
  });

  it('emits on set with origin', () => {
    const cb = vi.fn();
    const unsub = subscribeSort('test:a', cb);
    setCachedSort('test:a', { column: 'return_pct', direction: 'desc' }, 'ask-ontology');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual({ column: 'return_pct', direction: 'desc' });
    expect(cb.mock.calls[0][1]).toBe('ask-ontology');
    unsub();
  });

  it('getCachedSort default is null column', () => {
    expect(getCachedSort('test:missing')).toEqual({ column: null, direction: 'asc' });
  });

  it('removeCachedSort emits clear', () => {
    const cb = vi.fn();
    const unsub = subscribeSort('test:a', cb);
    setCachedSort('test:a', { column: 'x', direction: 'asc' }, 'local');
    removeCachedSort('test:a');
    expect(cb.mock.calls.at(-1)?.[1]).toBe('clear');
    unsub();
  });

  it('scoped to viewKey', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    subscribeSort('test:a', cbA);
    subscribeSort('test:b', cbB);
    setCachedSort('test:a', { column: 'c', direction: 'asc' });
    expect(cbA).toHaveBeenCalled();
    expect(cbB).not.toHaveBeenCalled();
  });
});
