// In-memory cache of working FilterState, keyed by viewKey
// (e.g. "source:store", "plus:staff", "bi:store_intel").
//
// Semantics:
// - Persists across navigation within the session (tab switch, mechanic ↔ BI)
// - Cleared by hard refresh (it's just a module-level Map, no storage)
// - Cleared explicitly via removeCachedFilter (called from the Clear All button)
// - Mechanic drill-in (BI filterField/filter props) is an override — the drill-in
//   caller writes the override into the cache so returning to the view replays
//   the drill-in filter (matches Jack's spec: "mechanic redirect overrides")
//
// Phase 8 addition — `subscribe(viewKey, cb)`:
// - Sets emit an `origin` token so subscribers can tell their own writes from
//   external ones (Ask Ontology writes with origin='ask-ontology'; table local writes
//   default to 'local'). Subscribers typically no-op when origin matches their
//   own writer id, preventing write-back loops.

import { createEmptyFilterState, type FilterState } from './filters';

export type FilterOrigin = 'local' | 'ask-ontology' | 'drill-in' | 'clear' | string;

export type FilterSubscriber = (state: FilterState, origin: FilterOrigin) => void;

const cache = new Map<string, FilterState>();
const subs = new Map<string, Set<FilterSubscriber>>();

export function getCachedFilter(viewKey: string): FilterState {
  return cache.get(viewKey) ?? createEmptyFilterState();
}

export function setCachedFilter(
  viewKey: string,
  state: FilterState,
  origin: FilterOrigin = 'local',
): void {
  cache.set(viewKey, state);
  emit(viewKey, state, origin);
}

export function removeCachedFilter(viewKey: string): void {
  cache.delete(viewKey);
  emit(viewKey, createEmptyFilterState(), 'clear');
}

export function subscribeFilter(
  viewKey: string,
  cb: FilterSubscriber,
): () => void {
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

function emit(viewKey: string, state: FilterState, origin: FilterOrigin): void {
  const set = subs.get(viewKey);
  if (!set) return;
  // Iterate a snapshot so unsubscribe-during-emit is safe.
  for (const cb of Array.from(set)) {
    try {
      cb(state, origin);
    } catch (err) {
      console.error('filterCache subscriber threw', err);
    }
  }
}
