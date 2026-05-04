// ViewContext — exposes the current view to Ask Ontology surfaces that want a
// derived {viewType, viewId, viewKey, actionable} tuple.
//
// Shape kept minimal: the dock needs {viewType, viewId, viewKey, actionable}
// to build the /api/ask payload and to know whether to attempt filter/sort
// actions. The full View union (with drill-in fields, home mode, etc.) stays
// in App.tsx.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { View } from '../types';

export interface ViewContextValue {
  /** 'bi' | 'plus' | 'source' | 'mech' | 'global' | null */
  viewType: 'bi' | 'plus' | 'source' | 'mech' | 'global' | null;
  /** Id within the type (dashboard id, table name, mechanic id). null on Home. */
  viewId: string | null;
  /** filterCache key (e.g. "bi:store_intel"). null when there's no actionable view. */
  viewKey: string | null;
  /** Whether filter/sort actions can be applied to this view (mech + home = false). */
  actionable: boolean;
  /** Human label for the dock header. */
  label: string;
}

const Ctx = createContext<ViewContextValue | null>(null);

export function ViewContextProvider({
  view,
  children,
}: {
  view: View;
  children: ReactNode;
}) {
  const value = useMemo<ViewContextValue>(() => deriveValue(view), [view]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewContext(): ViewContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useViewContext called outside ViewContextProvider');
  return v;
}

function deriveValue(view: View): ViewContextValue {
  switch (view.type) {
    case 'bi':
      return {
        viewType: 'bi',
        viewId: view.id,
        viewKey: `bi:${view.id}`,
        actionable: true,
        label: `BI · ${view.id}`,
      };
    case 'plus':
      return {
        viewType: 'plus',
        viewId: view.table,
        viewKey: `plus:${view.table}`,
        actionable: true,
        label: `Plus · ${view.table}`,
      };
    case 'source':
      return {
        viewType: 'source',
        viewId: view.table,
        viewKey: `source:${view.table}`,
        actionable: true,
        label: `Source · ${view.table}`,
      };
    case 'mech':
      return {
        viewType: 'mech',
        viewId: view.id,
        viewKey: null, // mechanics are narrative-only; no filter/sort target
        actionable: false,
        label: `Mechanic · ${view.id}`,
      };
    case 'home':
      return {
        viewType: null,
        viewId: null,
        viewKey: null,
        actionable: false,
        label: 'Home',
      };
    case 'ask-ontology':
      return {
        viewType: 'global',
        viewId: 'all',
        viewKey: null,
        actionable: false,
        label: 'Ask Ontology',
      };
    case 'triggers':
      return {
        viewType: null,
        viewId: null,
        viewKey: null,
        actionable: false,
        label: '2-Week Notice',
      };
    case 'tasks':
      return {
        viewType: null,
        viewId: null,
        viewKey: null,
        actionable: false,
        label: 'Next Steps',
      };
  }
}
