import { useMemo, useState } from 'react';

interface Props {
  column: string;
  options: string[];
  initialValues?: string[];
  onApply: (values: string[]) => void;
}

export function ValueFilterEditor({ column, options, initialValues = [], onApply }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(initialValues);
  const filteredOptions = useMemo(
    () => options.filter((option) => option.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    [options, query],
  );

  function toggleValue(value: string) {
    setSelected((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]);
  }

  function addVisible() {
    setSelected((prev) => Array.from(new Set([...prev, ...filteredOptions])));
  }

  function clearVisible() {
    setSelected((prev) => prev.filter((value) => !filteredOptions.includes(value)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <span style={{ color: 'var(--c-gray)' }}>Value filter · {column}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search values"
          style={inputStyle}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={addVisible} style={miniButtonStyle}>
          Select all visible
        </button>
        <button type="button" onClick={clearVisible} style={miniButtonStyle}>
          Clear visible
        </button>
        <button type="button" onClick={() => setSelected([])} style={miniButtonStyle}>
          Clear all
        </button>
        <span style={{ fontSize: 11, color: 'var(--c-gray)' }}>
          {selected.length} selected
        </span>
      </div>
      <div
        style={{
          maxHeight: 200,
          overflow: 'auto',
          display: 'grid',
          gap: 6,
          padding: 2,
        }}
      >
        {filteredOptions.map((option) => (
          <label key={option} style={optionLabelStyle}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => toggleValue(option)}
            />
            <span>{option || '(blank)'}</span>
          </label>
        ))}
      </div>
      <button type="button" onClick={() => onApply(selected)} style={applyButtonStyle}>
        Apply value filter
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--c-border)',
  background: 'var(--c-panel)',
};

const miniButtonStyle: React.CSSProperties = {
  border: '1px solid var(--c-border)',
  background: 'var(--c-panel)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
};

const optionLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  padding: '6px 8px',
  border: '1px solid var(--c-border)',
  borderRadius: 6,
  background: 'var(--c-panel-2)',
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
