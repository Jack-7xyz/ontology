import { useMemo, useState } from 'react';
import type { FilterCondition, NumberFilterOp, TextFilterOp } from '../../lib/filters';
import type { FlagColor } from '../../types';
import { FlagFilterEditor } from './FlagFilterEditor';
import { NumericFilterEditor } from './NumericFilterEditor';
import { TextFilterEditor } from './TextFilterEditor';
import { ValueFilterEditor } from './ValueFilterEditor';

export type FilterFieldKind = 'set' | 'text' | 'number' | 'flag';

export interface FilterField {
  key: string;
  label: string;
  kind: FilterFieldKind;
  options?: string[];
  textSuggestions?: string[];
  flagColumn?: string;
}

interface Props {
  fields: FilterField[];
  selectedFieldKey: string;
  onSelectField: (key: string) => void;
  condition?: FilterCondition;
  onApply: (condition: FilterCondition) => void;
  onClose: () => void;
}

export function FilterPopover({ fields, selectedFieldKey, onSelectField, condition, onApply, onClose }: Props) {
  const [fieldQuery, setFieldQuery] = useState('');
  const visibleFields = useMemo(
    () => fields.filter((field) => field.label.toLocaleLowerCase().includes(fieldQuery.toLocaleLowerCase())),
    [fieldQuery, fields],
  );
  const selectedKey = selectedFieldKey;
  const selectedField = visibleFields.find((field) => field.key === selectedKey)
    ?? fields.find((field) => field.key === selectedKey)
    ?? visibleFields[0]
    ?? fields.find((field) => field.kind === 'flag')
    ?? fields[0];

  if (!selectedField) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: 0,
        width: 340,
        background: 'var(--c-panel)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        boxShadow: '0 18px 44px rgba(0, 0, 0, 0.45)',
        padding: 14,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.4 }}>ADD FILTER</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onClose} style={closeButtonStyle}>×</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, minHeight: 300 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
            placeholder="Search fields"
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--c-border)',
              background: 'var(--c-panel)',
              fontSize: 12,
            }}
          />
          <div
            style={{
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              overflow: 'auto',
              maxHeight: 318,
              background: 'var(--c-panel-2)',
            }}
          >
          {visibleFields.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => onSelectField(field.key)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '9px 10px',
                border: 0,
                borderBottom: '1px solid var(--c-border)',
                background: field.key === selectedField.key ? 'rgba(134,198,202,0.16)' : 'transparent',
                color: field.key === selectedField.key ? 'var(--c-teal)' : 'var(--c-white)',
                fontSize: 12,
                fontWeight: field.key === selectedField.key ? 700 : 500,
              }}
            >
              {field.label}
            </button>
          ))}
          </div>
        </div>
        <div>
        {selectedField.kind === 'set' && (
          <ValueFilterEditor
            column={selectedField.label}
            options={selectedField.options ?? []}
            initialValues={condition?.kind === 'set' ? condition.values : []}
            onApply={(values) => {
              onApply({ kind: 'set', column: selectedField.key, values });
              onClose();
            }}
          />
        )}
        {selectedField.kind === 'text' && (
          <TextFilterEditor
            column={selectedField.label}
            suggestions={selectedField.textSuggestions}
            initialOp={condition?.kind === 'text' ? condition.op : 'contains'}
            initialValue={condition?.kind === 'text' ? condition.value : ''}
            onApply={(op: TextFilterOp, value: string) => {
              onApply({ kind: 'text', column: selectedField.key, op, value });
              onClose();
            }}
          />
        )}
        {selectedField.kind === 'number' && (
          <NumericFilterEditor
            column={selectedField.label}
            flagLabel={selectedField.flagColumn ? `${selectedField.label} threshold` : null}
            initialOp={condition?.kind === 'number' ? condition.op : '='}
            initialValue={condition?.kind === 'number' ? condition.value : undefined}
            initialMin={condition?.kind === 'number' ? condition.min : undefined}
            initialMax={condition?.kind === 'number' ? condition.max : undefined}
            initialFlagColor={condition?.kind === 'flag' ? condition.color : null}
            onApply={({ op, value, min, max }: { op: NumberFilterOp; value?: number; min?: number; max?: number }) => {
              onApply({ kind: 'number', column: selectedField.key, op, value, min, max });
              onClose();
            }}
            onApplyFlag={selectedField.flagColumn
              ? (color: FlagColor) => {
                  onApply({ kind: 'flag', color, column: selectedField.flagColumn });
                  onClose();
                }
              : undefined}
          />
        )}
        {selectedField.kind === 'flag' && (
          <FlagFilterEditor
            label={selectedField.label}
            initialColor={condition?.kind === 'flag' ? condition.color : 'green'}
            onApply={(color: FlagColor) => {
              onApply({ kind: 'flag', color, column: selectedField.flagColumn });
              onClose();
            }}
          />
        )}
        </div>
      </div>
    </div>
  );
}

const closeButtonStyle: React.CSSProperties = {
  border: '1px solid var(--c-border)',
  background: 'var(--c-panel)',
  borderRadius: 999,
  width: 26,
  height: 26,
  lineHeight: '20px',
  fontSize: 18,
};
