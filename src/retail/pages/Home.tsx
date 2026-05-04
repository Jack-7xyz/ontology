// Homepage: [header] → [ontology/lineage toggle] → [view] → [Ask Ontology dock].
// Dock sits at bottom of centre column, not in RightPanel.

import { useState } from 'react';
import type { HomeMode, View } from '../types';
import { OntologyIsometric } from '../components/OntologyIsometric';
import { Lineage } from '../components/Lineage';
import { AskOntologyDock } from '../components/AskOntologyDock';

interface Props {
  view: Extract<View, { type: 'home' }>;
  onNavigate: (v: View) => void;
}

export function Home({ view, onNavigate }: Props) {
  const [mode, setMode] = useState<HomeMode>('ontology');

  // Mode toggle clears the *other* mode's selection so RightPanel reflects current canvas.
  function changeMode(next: HomeMode) {
    setMode(next);
    if (next === 'ontology') onNavigate({ type: 'home', tier: view.tier });
    else onNavigate({ type: 'home', lineageFocus: view.lineageFocus });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', minHeight: 0 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--c-white)' }}>
          Retail Ontology
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--c-gray)', fontSize: 13 }}>
          120-store retailer · 10 source sheets · 5-layer ontology rebuild
        </p>
      </div>

      <ModeToggle mode={mode} onChange={changeMode} />

      {mode === 'ontology' ? (
        <OntologyIsometric
          selected={view.tier}
          onSelect={(tier) => onNavigate({ type: 'home', tier })}
        />
      ) : (
        <Lineage
          onNavigate={onNavigate}
          selected={view.lineageFocus ?? null}
          onSelectNode={(n) =>
            onNavigate({ type: 'home', lineageFocus: n ?? undefined })
          }
        />
      )}

      <AskOntologyDock />
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: HomeMode; onChange: (m: HomeMode) => void }) {
  const opts: { key: HomeMode; label: string; hint: string }[] = [
    { key: 'ontology', label: 'Ontology', hint: '5 tiers stacked, isometric' },
    { key: 'lineage', label: 'Lineage', hint: 'trace source → plus wiring' },
  ];
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <div
        style={{
          display: 'inline-flex',
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          borderRadius: 6,
          padding: 3,
        }}
      >
        {opts.map((o) => {
          const active = mode === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              style={{
                border: 'none',
                background: active ? 'var(--c-purple)' : 'transparent',
                color: active ? 'white' : 'var(--c-white)',
                padding: '6px 14px',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>
        {opts.find((o) => o.key === mode)?.hint}
      </span>
    </div>
  );
}
