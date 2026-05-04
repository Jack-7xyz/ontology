// Per-view SortState cache — mirrors filterCache shape + pub/sub semantics.
//
// Added in Phase 8 so Ask Ontology can pilot table sort alongside filter via the
// same action-application pattern. Table components subscribe, reading
// external writes (origin='ask-ontology') into their local sort state while
// ignoring their own writes (origin='local') to avoid loops.

import { createDefaultSortState, type SortState } from './sorting';

export type SortOrigin = 'local' | 'ask-ontology' | 'clear' | string;

export type SortSubscriber = (state: SortState, origin: SortOrigin) => void;

const cache = new Map<string, SortState>();
const subs = new Map<string, Set<SortSubscriber>>();

export function getCachedSort(viewKey: string): SortState {
  return cache.get(viewKey) ?? createDefaultSortState();
}

export function setCachedSort(
  viewKey: string,
  state: SortState,
  origin: SortOrigin = 'local',
): void {
  cache.set(viewKey, state);
  emit(viewKey, state, origin);
}

export function removeCachedSort(viewKey: string): void {
  cache.delete(viewKey);
  emit(viewKey, createDefaultSortState(), 'clear');
}

export function subscribeSort(viewKey: string, cb: SortSubscriber): () => void {
  let set = subs.get(viewKey);
  if (!set) {
    set = new Set();
    subs.set(viewKey, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) subs.delete(viewKey);
  };
}

function emit(viewKey: string, state: SortState, origin: SortOrigin): void {
  const set = subs.get(viewKey);
  if (!set) return;
  for (const cb of Array.from(set)) {
    try {
      cb(state, origin);
    } catch (err) {
      console.error('sortCache subscriber threw', err);
    }
  }
}
