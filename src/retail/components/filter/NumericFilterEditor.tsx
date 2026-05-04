import { useState } from 'react';
import type { NumberFilterOp } from '../../lib/filters';
import type { FlagColor } from '../../types';

interface Props {
  column: string;
  flagLabel?: string | null;
  initialOp?: NumberFilterOp;
  initialValue?: number;
  initialMin?: number;
  initialMax?: number;
  initialFlagColor?: FlagColor | null;
  onApply: (condition: { op: NumberFilterOp; value?: number; min?: number; max?: number }) => void;
  onApplyFlag?: (color: FlagColor) => void;
}

export function NumericFilterEditor({
  column,
  flagLabel = null,
  initialOp = '=',
  initialValue,
  initialMin,
  initialMax,
  initialFlagColor = null,
  onApply,
  onApplyFlag,
}: Props) {
  const [op, setOp] = useState<NumberFilterOp>(initialOp);
  const [value, setValue] = useState(initialValue?.toString() ?? '');
  const [min, setMin] = useState(initialMin?.toString() ?? '');
  const [max, setMax] = useState(initialMax?.toString() ?? '');
  const [flagColor, setFlagColor] = useState<FlagColor>(initialFlagColor ?? 'green');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>Numeric filter · {column}</span>
      <select value={op} onChange={(e) => setOp(e.target.value as NumberFilterOp)} style={fieldStyle}>
        <option value="=">=</option>
        <option value=">">{'>'}</option>
        <option value=">=">{'>='}</option>
        <option value="<">{'<'}</option>
        <option value="<=">{'<='}</option>
        <option value="between">between</option>
      </select>
      {op === 'between' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min" style={fieldStyle} />
          <input value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max" style={fieldStyle} />
        </div>
      ) : (
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" style={fieldStyle} />
      )}
      <button
        type="button"
        onClick={() => onApply(
          op === 'between'
            ? { op, min: Number(min), max: Number(max) }
            : { op, value: Number(value) },
        )}
        style={applyButtonStyle}
      >
        Apply numeric filter
      </button>
      {flagLabel && onApplyFlag && (
        <>
          <div style={{ height: 1, background: 'var(--c-border)' }} />
          <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>{flagLabel}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {(['green', 'yellow', 'red'] as FlagColor[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFlagColor(option)}
                style={{
                  border: flagColor === option ? '2px solid var(--c-teal)' : '1px solid var(--c-border)',
                  background:
                    option === 'green'
                      ? 'var(--c-flag-green)'
                      : option === 'yellow'
                        ? 'var(--c-flag-yellow)'
                        : 'var(--c-flag-red)',
                  color: option === 'yellow' ? 'var(--c-neutral-dark)' : 'var(--c-white)',
                  borderRadius: 8,
                  padding: '0',
                  height: 34,
                  fontSize: 0,
                  fontWeight: flagColor === option ? 700 : 500,
                  minWidth: 0,
                }}
                title={option}
              >
                <span
                  style={{
                    display: 'block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: option === 'yellow' ? 'rgba(26,26,46,0.8)' : 'rgba(255,255,255,0.9)',
                    margin: '0 auto',
                  }}
                />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onApplyFlag(flagColor)} style={applyButtonStyle}>
            Apply threshold filter
          </button>
        </>
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--c-border)',
  background: 'var(--c-panel)',
  fontSize: 12,
};

const applyButtonStyle: React.CSSProperties = {
  border: '1px solid var(--c-purple)',
  background: 'var(--c-purple)',
  color: 'var(--c-white)',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
};
