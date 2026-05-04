// Subscribe to filterCache + sortCache writes that did NOT originate from the
// local component (origin !== 'local'), forwarding them to caller callbacks.
//
// Origin-filtering is how we avoid write-back loops: a table that calls
// setCachedFilter(key, state, 'local') will see its own emit fire but skip it.
// External writes (origin='ask-ontology', 'clear', etc.) land in the callbacks
// so the table can update its local state.
//
// Callbacks are stored in refs so we always invoke the latest closure without
// re-subscribing on every render.

import { useEffect, useRef } from 'react';
import { subscribeFilter } from '../lib/filterCache';
import { subscribeSort } from '../lib/sortCache';
import type { FilterState } from '../lib/filters';
import type { SortState } from '../lib/sorting';

const LOCAL = 'local';

export function useExternalFilterSort(
  viewKey: string | null,
  onExternalFilter: (state: FilterState, origin: string) => void,
  onExternalSort: (state: SortState, origin: string) => void,
): void {
  const filterRef = useRef(onExternalFilter);
  const sortRef = useRef(onExternalSort);
  filterRef.current = onExternalFilter;
  sortRef.current = onExternalSort;

  useEffect(() => {
    if (!viewKey) return;
    const offF = subscribeFilter(viewKey, (state, origin) => {
      if (origin === LOCAL) return;
      filterRef.current(state, origin);
    });
    const offS = subscribeSort(viewKey, (state, origin) => {
      if (origin === LOCAL) return;
      sortRef.current(state, origin);
    });
    return () => {
      offF();
      offS();
    };
  }, [viewKey]);
}
