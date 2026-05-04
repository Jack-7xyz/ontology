import {
  areFilterStatesEqual,
  cloneFilterState,
  createEmptyFilterState,
  type FilterPreset,
  type FilterState,
} from './filters';

export interface ViewFilterState {
  preset: FilterPreset | null;
  baseline: FilterState;
  working: FilterState;
}

export type FilterSessionStore = Record<string, ViewFilterState>;

interface CreateViewFilterStateOptions {
  preset?: FilterPreset | null;
  baseline?: FilterState;
  working?: FilterState;
}

export function createViewFilterState(options: CreateViewFilterStateOptions = {}): ViewFilterState {
  const preset = options.preset ?? null;
  const baselineSource = options.baseline ?? preset?.state ?? createEmptyFilterState();
  const baseline = cloneFilterState(baselineSource);
  const working = cloneFilterState(options.working ?? baseline);

  return {
    preset: preset ? { ...preset, state: cloneFilterState(preset.state) } : null,
    baseline,
    working,
  };
}

export function createEmptyFilterSession(): FilterSessionStore {
  return {};
}

export function ensureViewFilterState(
  store: FilterSessionStore,
  key: string,
  options: CreateViewFilterStateOptions = {},
): FilterSessionStore {
  if (store[key]) return store;
  return {
    ...store,
    [key]: createViewFilterState(options),
  };
}

export function updateViewWorkingState(
  store: FilterSessionStore,
  key: string,
  working: FilterState,
): FilterSessionStore {
  const current = store[key] ?? createViewFilterState();
  return {
    ...store,
    [key]: {
      ...current,
      working: cloneFilterState(working),
    },
  };
}

export function resetViewToBaseline(store: FilterSessionStore, key: string): FilterSessionStore {
  const current = store[key];
  if (!current) return store;

  return {
    ...store,
    [key]: {
      ...current,
      working: cloneFilterState(current.baseline),
    },
  };
}

export function replaceViewBaseline(
  store: FilterSessionStore,
  key: string,
  options: { preset?: FilterPreset | null; baseline?: FilterState },
): FilterSessionStore {
  return {
    ...store,
    [key]: createViewFilterState(options),
  };
}

export function viewHasDiverged(viewState: ViewFilterState): boolean {
  return !areFilterStatesEqual(viewState.baseline, viewState.working);
}
