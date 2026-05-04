// Global toggle for the "verbose header" — description row + ƒ formula sub-row.
// When off, headers shrink to column name + type (+ flag legend on BI) so more
// data rows stay visible under the frozen <thead>. Shared by PlusTable + BiTable.
// Persists to localStorage so the choice survives navigation and reloads.

import { useEffect, useState } from 'react';

const KEY = 'ontology.retail.table.showFormulas';

function load(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return true; // default on
    return v === '1';
  } catch {
    return true;
  }
}

export function useShowFormulas(): [boolean, () => void] {
  const [show, setShow] = useState<boolean>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, show ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [show]);
  return [show, () => setShow((s) => !s)];
}

// Small inline button used by every table header.
export function FormulaToggleButton({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={show ? 'Compact headers (hide descriptions + ƒ formulas)' : 'Verbose headers (show descriptions + ƒ formulas)'}
      style={{
        background: show ? 'var(--c-purple)' : 'var(--c-panel)',
        border: '1px solid var(--c-border)',
        padding: '3px 10px',
        borderRadius: 4,
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        color: 'var(--c-white)',
      }}
    >
      header: {show ? 'verbose' : 'compact'}
    </button>
  );
}
