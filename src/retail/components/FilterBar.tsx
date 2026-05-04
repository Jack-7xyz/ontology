import { useMemo, useState } from 'react';
import { hasFilterDiverged, normalizeFilterState, type FilterCondition, type FilterPreset, type FilterState } from '../lib/filters';
import { createDefaultSortState, type SortState } from '../lib/sorting';
import { FilterPills } from './filter/FilterPills';
import { FilterPopover, type FilterField } from './filter/FilterPopover';
import { PresetStrip } from './filter/PresetStrip';

interface Props {
  fields: FilterField[];
  baseline: FilterState;
  working: FilterState;
  preset?: FilterPreset | null;
  showingCount: number;
  totalCount: number;
  sort: SortState;
  onSortChange: (next: SortState) => void;
  onChange: (next: FilterState) => void;
  onClearAll: () => void;
  onResetToPreset?: () => void;
}

export function FilterBar({
  fields,
  baseline,
  working,
  preset = null,
  showingCount,
  totalCount,
  sort,
  onSortChange,
  onChange,
  onClearAll,
  onResetToPreset,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFieldKey, setSelectedFieldKey] = useState(fields[0]?.key ?? '__flag__');
  const normalizedWorking = useMemo(() => normalizeFilterState(working), [working]);
  const diverged = hasFilterDiverged(baseline, working);
  const selectedField = fields.find((field) => field.key === selectedFieldKey) ?? fields[0];

  function upsertCondition(nextCondition: FilterCondition) {
    const nextConditions = normalizedWorking.conditions.filter((condition) => {
      if (condition.kind === 'flag' && nextCondition.kind === 'flag') {
        return condition.column !== nextCondition.column;
      }
      if (condition.kind === 'flag' || nextCondition.kind === 'flag') return true;
      return condition.column !== nextCondition.column;
    });

    onChange(normalizeFilterState({ conditions: [...nextConditions, nextCondition] }));
  }

  function maybeOpenFromBarClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('button, select, input, textarea, label')) return;
    setIsOpen(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PresetStrip preset={preset} hasDiverged={diverged} />
      <div
        style={{
          border: '1px solid var(--c-border)',
          borderRadius: 10,
          background: 'var(--c-panel)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center' }}
            onClick={maybeOpenFromBarClick}
          >
            <button type="button" onClick={() => setIsOpen((open) => !open)} style={primaryButtonStyle}>
              Add filter
            </button>
            {isOpen && selectedField && (
              <FilterPopover
                fields={fields}
                selectedFieldKey={selectedField.key}
                onSelectField={setSelectedFieldKey}
                onApply={upsertCondition}
                onClose={() => setIsOpen(false)}
              />
            )}
          </div>
          <button type="button" onClick={onClearAll} style={secondaryButtonStyle}>
            Clear all
          </button>
          {preset && diverged && onResetToPreset && (
            <button type="button" onClick={onResetToPreset} style={secondaryButtonStyle}>
              Reset to preset
            </button>
          )}
          <select
            value={sort.column ?? '__default__'}
            onChange={(e) => onSortChange({
              column: e.target.value === '__default__' ? null : e.target.value,
              direction: sort.direction,
            })}
            style={selectStyle}
          >
            <option value="__default__">Default sorting</option>
            {fields.filter((field) => field.kind !== 'flag').map((field) => (
              <option key={field.key} value={field.key}>
                Sort by {field.label}
              </option>
            ))}
          </select>
          <select
            value={sort.direction}
            onChange={(e) => onSortChange({
              column: sort.column,
              direction: e.target.value as SortState['direction'],
            })}
            style={selectStyle}
            disabled={!sort.column}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          {sort.column && (
            <button type="button" onClick={() => onSortChange(createDefaultSortState())} style={secondaryButtonStyle}>
              Reset sort
            </button>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--c-gray)' }}>
            {sort.column ? `Sorted by ${sort.column} (${sort.direction})` : 'Default sorting'}
            {' · '}
            Showing {showingCount.toLocaleString()} of {totalCount.toLocaleString()} rows
          </span>
        </div>
        <div
          onClick={maybeOpenFromBarClick}
          style={{
            border: '1px dashed var(--c-border)',
            borderRadius: 8,
            padding: '10px 12px',
            minHeight: 48,
            background: normalizedWorking.conditions.length === 0 ? 'var(--c-panel-2)' : 'transparent',
          }}
        >
          <FilterPills
            conditions={normalizedWorking.conditions}
            onRemove={(index) => {
              const nextConditions = normalizedWorking.conditions.filter((_, conditionIndex) => conditionIndex !== index);
              onChange({ conditions: nextConditions });
            }}
          />
        </div>
      </div>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--c-purple)',
  background: 'var(--c-purple)',
  color: 'var(--c-white)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--c-border)',
  background: 'var(--c-panel)',
  color: 'var(--c-white)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 500,
};

const selectStyle: React.CSSProperties = {
  border: '1px solid var(--c-border)',
  background: 'var(--c-panel-2)',
  color: 'var(--c-white)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
};
