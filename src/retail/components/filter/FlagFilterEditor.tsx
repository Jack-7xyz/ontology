import { useState } from 'react';
import type { FlagColor } from '../../types';

interface Props {
  label?: string;
  initialColor?: FlagColor;
  onApply: (color: FlagColor) => void;
}

export function FlagFilterEditor({ label = 'BI threshold filter', initialColor = 'green', onApply }: Props) {
  const [color, setColor] = useState<FlagColor>(initialColor);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>{label}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {(['green', 'yellow', 'red'] as FlagColor[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setColor(option)}
            style={{
              border: color === option ? '2px solid var(--c-teal)' : '1px solid var(--c-border)',
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
              fontWeight: color === option ? 700 : 500,
              boxShadow: color === option ? '0 0 0 2px rgba(26,26,46,0.08)' : 'none',
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
      <button type="button" onClick={() => onApply(color)} style={applyButtonStyle}>
        Apply flag filter
      </button>
    </div>
  );
}

const applyButtonStyle: React.CSSProperties = {
  border: '1px solid var(--c-purple)',
  background: 'var(--c-purple)',
  color: 'var(--c-white)',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
};
