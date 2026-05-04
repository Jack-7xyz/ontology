import { useMemo, useState } from 'react';
import type { TextFilterOp } from '../../lib/filters';

interface Props {
  column: string;
  suggestions?: string[];
  initialOp?: TextFilterOp;
  initialValue?: string;
  onApply: (op: TextFilterOp, value: string) => void;
}

export function TextFilterEditor({
  column,
  suggestions = [],
  initialOp = 'contains',
  initialValue = '',
  onApply,
}: Props) {
  const [op, setOp] = useState<TextFilterOp>(initialOp);
  const [value, setValue] = useState(initialValue);
  const visibleSuggestions = useMemo(
    () => suggestions.filter((item) => item.toLocaleLowerCase().includes(value.toLocaleLowerCase())).slice(0, 50),
    [suggestions, value],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>Text filter · {column}</span>
      <select value={op} onChange={(e) => setOp(e.target.value as TextFilterOp)} style={fieldStyle}>
        <option value="contains">contains</option>
        <option value="equals">equals</option>
        <option value="starts_with">starts with</option>
      </select>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter text"
        style={fieldStyle}
      />
      {suggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: 'var(--c-gray)', fontSize: 11 }}>Suggestions</span>
          <div
            style={{
              maxHeight: 180,
              overflow: 'auto',
              border: '1px solid var(--c-border)',
              borderRadius: 8,
              background: 'var(--c-panel-2)',
            }}
          >
            {visibleSuggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setValue(item)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 0,
                  borderBottom: '1px solid var(--c-border)',
                  background: 'transparent',
                  fontSize: 12,
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="button" onClick={() => onApply(op, value)} style={applyButtonStyle}>
        Apply text filter
      </button>
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
