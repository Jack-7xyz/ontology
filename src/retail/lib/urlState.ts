// URL-state serde for the current View only.
//
//   ?v=<compact-json>   — current View (type + table/id + optional BI drill-in args)
//
// Filter state is NOT in the URL — it lives in a per-view in-memory cache
// (see filterCache.ts). URL stays short; filters survive tab switches within
// the session, reset on hard refresh.

import type { View } from '../types';

const PARAM_VIEW = 'v';

export function encodeView(view: View): string {
  return JSON.stringify(view);
}

export function decodeView(raw: string | null): View | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return null;
    switch (parsed.type) {
      case 'home':
        return { type: 'home' };
      case 'source':
        return typeof parsed.table === 'string' ? { type: 'source', table: parsed.table } : null;
      case 'plus':
        return typeof parsed.table === 'string' ? { type: 'plus', table: parsed.table } : null;
      case 'bi':
        if (typeof parsed.id !== 'string') return null;
        return {
          type: 'bi',
          id: parsed.id,
          anchor: typeof parsed.anchor === 'string' ? parsed.anchor : undefined,
          filter_field: typeof parsed.filter_field === 'string' ? parsed.filter_field : undefined,
          filter: typeof parsed.filter === 'string' ? parsed.filter : undefined,
        };
      case 'mech':
        return typeof parsed.id === 'string'
          ? {
              type: 'mech',
              id: parsed.id,
              selectedImprovementId: typeof parsed.selectedImprovementId === 'string'
                ? parsed.selectedImprovementId
                : undefined,
            }
          : null;
      case 'ask-ontology':
        return { type: 'ask-ontology' };
      case 'triggers':
        return {
          type: 'triggers',
          selectedImprovementId: typeof parsed.selectedImprovementId === 'string'
            ? parsed.selectedImprovementId
            : undefined,
        };
      case 'tasks':
        return {
          type: 'tasks',
          selectedImprovementId: typeof parsed.selectedImprovementId === 'string'
            ? parsed.selectedImprovementId
            : undefined,
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function readSearch(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function writeSearch(params: URLSearchParams): void {
  if (typeof window === 'undefined') return;
  const qs = params.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', url);
}

export function readViewFromUrl(): View | null {
  return decodeView(readSearch().get(PARAM_VIEW));
}

export function writeViewToUrl(view: View): void {
  const params = readSearch();
  if (view.type === 'home') {
    params.delete(PARAM_VIEW);
  } else {
    params.set(PARAM_VIEW, encodeView(view));
  }
  writeSearch(params);
}
