// Right-side helper panel. Context-sensitive:
//   home (no tier)    → brief intro + tier legend
//   home + tier       → items in the selected tier (click → navigate)
//   source            → column list for the active table
//   plus              → column list with derived flag, formula, description
//
// Mode 'closed' renders a thin rail with a reopen button so the panel can be hidden on any page.

import type {
  BiColumn,
  BiMeta,
  ImprovementEffort,
  ImprovementPriority,
  MechanicImprovements,
  PlusColumn,
  PlusMeta,
  OntologyImprovement,
  RightPanelMode,
  TierKey,
  View,
} from '../types';
import { useEffect, useState } from 'react';
import { api, type BiInfo, type Column, type EnrichedImprovement, type PlusInfo, type SnapshotInfo } from '../api/client';
import { AskOntologyChat } from './AskOntologyChat';
import {
  BI_BY_ID,
  MECH_BY_ID,
  biConsumingPlus,
  mechConsumingBi,
  type LineageLayer,
} from '../lineage/graph';

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  mode: RightPanelMode;
  onToggleMode: () => void;
  tab: 'context' | 'ask-ontology';
  onSelectTab: (tab: 'context' | 'ask-ontology') => void;
}

export function RightPanel({ view, onNavigate, mode, onToggleMode, tab, onSelectTab }: Props) {
  if (mode === 'closed') {
    return (
      <aside
        style={{
          background: 'var(--c-panel)',
          borderLeft: '1px solid var(--c-border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
        }}
      >
        <button
          onClick={() => onSelectTab('context')}
          title="Open context panel"
          style={{
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
            color: 'var(--c-gray)',
            cursor: 'pointer',
          }}
        >
          ‹
        </button>
        <button
          onClick={() => onSelectTab('ask-ontology')}
          title="Open Ask Ontology"
          style={{
            marginTop: 6,
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
            color: 'var(--c-gray)',
            cursor: 'pointer',
          }}
        >
          ✦
        </button>
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            marginTop: 12,
            fontSize: 9,
            letterSpacing: 1,
            color: 'var(--c-gray)',
            textTransform: 'uppercase',
          }}
        >
          {tab === 'ask-ontology' ? 'Ask Ontology' : 'Context'}
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        background: 'var(--c-panel)',
        borderLeft: '1px solid var(--c-border)',
        color: 'var(--c-white)',
        padding: 16,
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <PanelTab active={tab === 'context'} onClick={() => onSelectTab('context')}>
          Context
        </PanelTab>
        <PanelTab active={tab === 'ask-ontology'} onClick={() => onSelectTab('ask-ontology')}>
          Ask Ontology
        </PanelTab>
        <span style={{ flex: 1 }} />
        <button
          onClick={onToggleMode}
          title="Hide context panel"
          style={{
            background: 'transparent',
            border: '1px solid var(--c-border)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            color: 'var(--c-gray)',
            cursor: 'pointer',
          }}
        >
          hide ›
        </button>
      </div>
      {tab === 'ask-ontology' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <AskOntologyChat
            viewType={askOntologySurfaceForView(view).viewType}
            viewId={askOntologySurfaceForView(view).viewId}
            cacheKey={askOntologySurfaceForView(view).cacheKey}
            variant="dock"
            label={askOntologySurfaceForView(view).label}
            fillAvailableHeight={true}
          />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {view.type === 'home' && view.lineageFocus && (
            <LineageNodeHelper focus={view.lineageFocus} onNavigate={onNavigate} />
          )}
          {view.type === 'home' && !view.lineageFocus && !view.tier && <HomeIntro />}
          {view.type === 'home' && !view.lineageFocus && view.tier && (
            <TierPanel tier={view.tier} onNavigate={onNavigate} />
          )}
          {view.type === 'source' && <SourceHelper table={view.table} />}
          {view.type === 'plus' && <PlusHelper plusId={view.table} />}
          {view.type === 'bi' && <BiHelper biId={view.id} onNavigate={onNavigate} />}
          {view.type === 'tasks' && (
            <TaskDetailHelper improvementId={view.selectedImprovementId} onNavigate={onNavigate} />
          )}
          {view.type === 'mech' && (
            <TaskDetailHelper
              improvementId={view.selectedImprovementId}
              onNavigate={onNavigate}
              defaultMessage="Click an improvement in the list to see full details here."
            />
          )}
          {view.type === 'triggers' && view.selectedImprovementId && (
            <TaskDetailHelper improvementId={view.selectedImprovementId} onNavigate={onNavigate} />
          )}
          {view.type === 'triggers' && !view.selectedImprovementId && (
            <TriggerHelper />
          )}
        </div>
      )}
    </aside>
  );
}

function PanelTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: '1px solid var(--c-border)',
        borderRadius: 999,
        padding: '5px 10px',
        fontSize: 11,
        fontWeight: 600,
        background: active ? 'var(--c-purple)' : 'transparent',
        color: active ? 'white' : 'var(--c-gray)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function askOntologySurfaceForView(view: View): {
  viewType: 'bi' | 'plus' | 'source' | 'mech' | 'global';
  viewId: string;
  cacheKey?: string;
  label: string;
} {
  switch (view.type) {
    case 'bi':
      return { viewType: 'bi', viewId: view.id, cacheKey: `bi:${view.id}`, label: `BI · ${view.id}` };
    case 'plus':
      return { viewType: 'plus', viewId: view.table, cacheKey: `plus:${view.table}`, label: `Plus · ${view.table}` };
    case 'source':
      return { viewType: 'source', viewId: view.table, cacheKey: `source:${view.table}`, label: `Source · ${view.table}` };
    case 'mech':
      return { viewType: 'mech', viewId: view.id, label: `Mechanic · ${view.id}` };
    case 'home':
    case 'ask-ontology':
      return { viewType: 'global', viewId: 'all', label: 'Ask Ontology' };
    case 'triggers':
      return { viewType: 'global', viewId: 'all', label: '2-Week Notice' };
    case 'tasks':
      return { viewType: 'global', viewId: 'all', label: 'Next Steps' };
  }
}

function HomeIntro() {
  return (
    <div>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--c-gray)',
        }}
      >
        Context panel
      </h3>
      <p style={{ margin: '0 0 12px', color: 'var(--c-gray)', fontSize: 12 }}>
        Click a tier in the ontology to list its items here. Switch to the Ask Ontology tab
        for cross-app questions.
      </p>
      <TierLegend />
    </div>
  );
}

// Static tier rosters. Source / Plus / BI populated live.
const TIER_STATIC: Record<
  Exclude<TierKey, 'source' | 'plus' | 'bi'>,
  { heading: string; items: { label: string; sub?: string; view: View }[] }
> = {
  utility: {
    heading: 'Utility',
    items: [
      { label: 'AskOntology NL→SQL',      sub: 'natural-language query → SQL', view: { type: 'ask-ontology' } },
      { label: '2-Week Notice Trigger', sub: 'cascading store-risk alert',   view: { type: 'triggers' } },
      { label: 'Next Steps',            sub: 'Ontology improvements kanban',    view: { type: 'tasks' } },
    ],
  },
  mechanics: {
    heading: 'Mechanics',
    items: [
      { label: 'Red Count',                sub: 'revenue anomaly detection', view: { type: 'mech', id: 'red_count' } },
      { label: 'Revenue Decomposition',    sub: 'YoY / WoW breakdown',      view: { type: 'mech', id: 'rev_decomp' } },
      { label: 'Attribution Gap',          sub: 'channel attribution delta', view: { type: 'mech', id: 'attr_gap' } },
      { label: 'HG Processor Detection',   sub: 'headless/gift detection',   view: { type: 'mech', id: 'hg_processor' } },
      { label: 'Performance Flag Cascade', sub: 'store performance scoring', view: { type: 'mech', id: 'perf_flag_cascade' } },
      { label: 'Fine Revenue Estimation',  sub: 'order-level rev model',     view: { type: 'mech', id: 'fine_rev' } },
    ],
  },
};

function TierPanel({
  tier,
  onNavigate,
}: {
  tier: TierKey;
  onNavigate: (v: View) => void;
}) {
  const [info, setInfo] = useState<SnapshotInfo | null>(null);
  const [plus, setPlus] = useState<PlusInfo | null>(null);
  const [biData, setBiData] = useState<BiInfo | null>(null);

  useEffect(() => {
    if (tier === 'source') api.snapshotInfo().then(setInfo).catch(() => {});
    if (tier === 'plus') api.plusInfo().then(setPlus).catch(() => {});
    if (tier === 'bi') api.biInfo().then(setBiData).catch(() => {});
  }, [tier]);

  if (tier === 'source') {
    return (
      <div>
        <TierHeading label="Source" />
        <div style={{ fontSize: 12, color: 'var(--c-gray)', margin: '0 0 10px' }}>
          {info ? `${info.tables.length} tables · ${Object.values(info.rows_per).reduce((a, b) => a + b, 0).toLocaleString()} rows` : 'loading…'}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {info?.tables.map((t) => (
            <li
              key={t}
              onClick={() => onNavigate({ type: 'source', table: t })}
              style={{
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                borderRadius: 4,
                fontSize: 12,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-light-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{t}</span>
              <span style={{ color: 'var(--c-gray)', fontSize: 11 }}>
                {info.rows_per[t]?.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (tier === 'plus') {
    const totalDerived = plus
      ? plus.tables.reduce(
          (a, pid) => a + plus.meta[pid].columns.filter((c) => c.tier === 'tab_derived').length,
          0,
        )
      : 0;
    return (
      <div>
        <TierHeading label="Plus (staging)" />
        <div style={{ fontSize: 12, color: 'var(--c-gray)', margin: '0 0 10px', lineHeight: 1.4 }}>
          {plus
            ? `${plus.tables.length} tabs · ${totalDerived} derived metrics. Source columns + Tab+ derived metrics. BI dashboards build on these (not on Source).`
            : 'loading…'}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {plus?.tables.map((pid) => {
            const m = plus.meta[pid];
            const derived = m.columns.filter((c) => c.tier === 'tab_derived');
            return (
              <li
                key={pid}
                onClick={() => onNavigate({ type: 'plus', table: pid })}
                title={`${m.label} — src: ${m.source_table}\n\n${m.description}`}
                style={{
                  padding: '8px 10px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 12,
                  margin: '2px 0',
                  borderLeft: '3px solid var(--c-tier-tab-derived)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-light-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <strong>{m.label}</strong>
                  <span style={{ color: 'var(--c-gray)', fontSize: 10 }}>
                    {derived.length} derived
                  </span>
                </div>
                <div style={{ color: 'var(--c-gray)', fontSize: 10, marginTop: 2 }}>
                  src: <code>{m.source_table}</code>
                </div>
                {derived.length > 0 && (
                  <div
                    style={{
                      marginTop: 4,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 3,
                    }}
                  >
                    {derived.map((d) => (
                      <span
                        key={d.name}
                        title={d.formula ?? ''}
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          background: 'var(--c-tier-tab-derived)',
                          borderRadius: 2,
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                          color: 'var(--c-teal)',
                        }}
                      >
                        {d.name}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (tier === 'bi') {
    const totalFlagged = biData
      ? biData.dashboards.reduce(
          (a, bid) => a + biData.meta[bid].columns.filter((c) => c.flag_rule !== null).length,
          0,
        )
      : 0;
    return (
      <div>
        <TierHeading label="BI Dashboards" />
        <div style={{ fontSize: 12, color: 'var(--c-gray)', margin: '0 0 10px', lineHeight: 1.4 }}>
          {biData
            ? `${biData.dashboards.length} dashboards · ${totalFlagged} flagged columns total. Each composes one or more Plus tabs and adds G/Y/R coloring.`
            : 'loading…'}
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {biData?.dashboards.map((bid) => {
            const m = biData.meta[bid];
            const flagged = m.columns.filter((c) => c.flag_rule !== null);
            return (
              <li
                key={bid}
                onClick={() => onNavigate({ type: 'bi', id: bid })}
                title={`${m.label}\n\n${m.description}`}
                style={{
                  padding: '8px 10px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  fontSize: 12,
                  margin: '2px 0',
                  borderLeft: '3px solid var(--c-tier-bi-derived)',
                  background: 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-light-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <strong>{m.label}</strong>
                  <span style={{ color: 'var(--c-gray)', fontSize: 10 }}>
                    {flagged.length} flagged
                  </span>
                </div>
                <div style={{ color: 'var(--c-gray)', fontSize: 10, marginTop: 2 }}>
                  from: {m.upstream_plus.join(', ')}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const cfg = TIER_STATIC[tier as 'utility' | 'mechanics'];
  return (
    <div>
      <TierHeading label={cfg.heading} />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {cfg.items.map((it) => (
          <li
            key={it.label}
            onClick={() => onNavigate(it.view)}
            style={{
              padding: '6px 8px',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-light-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span>{it.label}</span>
            {it.sub && (
              <span style={{ fontSize: 10, color: 'var(--c-gray)' }}>{it.sub}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TierHeading({ label }: { label: string }) {
  return (
    <h3
      style={{
        margin: '0 0 8px',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: 'var(--c-gray)',
      }}
    >
      Tier: {label}
    </h3>
  );
}

function SourceHelper({ table }: { table: string }) {
  const [cols, setCols] = useState<Column[] | null>(null);
  const [rows, setRows] = useState<number | null>(null);

  useEffect(() => {
    api.snapshotInfo().then((info) => {
      setCols(info.columns_per[table] ?? null);
      setRows(info.rows_per[table] ?? null);
    });
  }, [table]);

  return (
    <div>
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--c-gray)',
        }}
      >
        Table: {table}
      </h3>
      <div style={{ fontSize: 12, color: 'var(--c-gray)', marginBottom: 12 }}>
        {rows !== null ? `${rows.toLocaleString()} rows` : '…'} · tier:{' '}
        <strong style={{ color: 'var(--c-white)' }}>raw</strong>
      </div>
      <h4
        style={{
          margin: '14px 0 6px',
          fontSize: 11,
          textTransform: 'uppercase',
          color: 'var(--c-gray)',
        }}
      >
        Columns
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
        {cols?.map((c) => (
          <li
            key={c.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 0',
              borderBottom: '1px solid var(--c-border)',
            }}
          >
            <span>{c.name}</span>
            <span style={{ color: 'var(--c-gray)', fontSize: 11 }}>{c.type}</span>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 18 }}>
        <TierLegend />
      </div>
    </div>
  );
}

function PlusHelper({ plusId }: { plusId: string }) {
  const [meta, setMeta] = useState<PlusMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setMeta(null);
    api
      .plusInfo()
      .then((info) => {
        if (info.meta[plusId]) setMeta(info.meta[plusId]);
        else setErr(`unknown plus tab: ${plusId}`);
      })
      .catch((e) => setErr(String(e)));
  }, [plusId]);

  if (err) return <div style={{ color: 'var(--c-flag-red)' }}>{err}</div>;
  if (!meta) return <div style={{ color: 'var(--c-gray)' }}>loading…</div>;

  const raw = meta.columns.filter((c) => c.tier === 'raw');
  const derived = meta.columns.filter((c) => c.tier === 'tab_derived');

  return (
    <div>
      <h3
        style={{
          margin: '0 0 4px',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--c-gray)',
        }}
      >
        {meta.label}
      </h3>
      <div style={{ fontSize: 11, color: 'var(--c-gray)', marginBottom: 6 }}>
        src: <code>{meta.source_table}</code> · {raw.length} raw + {derived.length} derived
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-white)', lineHeight: 1.4, marginBottom: 14 }}>
        {meta.description}
      </div>

      <ColumnGroup
        heading={`Derived metrics (${derived.length})`}
        tier="tab_derived"
        columns={derived}
      />
      <ColumnGroup
        heading={`Raw source columns (${raw.length})`}
        tier="raw"
        columns={raw}
      />

      <div style={{ marginTop: 18 }}>
        <TierLegend />
      </div>
    </div>
  );
}

function ColumnGroup({
  heading,
  tier,
  columns,
}: {
  heading: string;
  tier: 'raw' | 'tab_derived';
  columns: PlusColumn[];
}) {
  if (columns.length === 0) return null;
  const tierBg = tier === 'tab_derived' ? 'var(--c-tier-tab-derived)' : 'var(--c-tier-raw)';
  return (
    <div style={{ marginBottom: 16 }}>
      <h4
        style={{
          margin: '8px 0 6px',
          fontSize: 11,
          textTransform: 'uppercase',
          color: 'var(--c-gray)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            background: tierBg,
            border: '1px solid #C7C2F0',
            borderRadius: 2,
          }}
        />
        {heading}
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {columns.map((c) => (
          <li
            key={c.name}
            style={{
              padding: '6px 8px',
              margin: '3px 0',
              borderLeft: `3px solid ${tierBg}`,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 3,
              fontSize: 12,
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{ color: 'var(--c-gray)', fontSize: 10 }}>{c.type}</span>
            </div>
            {c.formula && (
              <div
                style={{
                  marginTop: 3,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 10,
                  color: 'var(--c-teal)',
                  background: 'rgba(134,198,202,0.14)',
                  padding: '2px 4px',
                  borderRadius: 2,
                  whiteSpace: 'normal',
                  lineHeight: 1.35,
                }}
              >
                ƒ {c.formula}
              </div>
            )}
            <div
              style={{
                marginTop: 3,
                color: 'var(--c-gray)',
                fontSize: 10,
                lineHeight: 1.35,
                fontStyle: 'italic',
              }}
            >
              {c.description}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------- Lineage node helpers ----------

function LineageNodeHelper({
  focus,
  onNavigate,
}: {
  focus: { layer: LineageLayer; id: string };
  onNavigate: (v: View) => void;
}) {
  const breadcrumb: Record<LineageLayer, string> = {
    source: 'SOURCE · raw xlsx',
    plus: 'PLUS · staging (1:1)',
    bi: 'BI · dashboard',
    mech: 'MECHANIC · alert',
  };
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.6,
          color: 'var(--c-gray)',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {breadcrumb[focus.layer]}
      </div>
      {focus.layer === 'source' && <SourceNodeBody id={focus.id} onNavigate={onNavigate} />}
      {focus.layer === 'plus' && <PlusNodeBody id={focus.id} onNavigate={onNavigate} />}
      {focus.layer === 'bi' && <BiNodeBody id={focus.id} onNavigate={onNavigate} />}
      {focus.layer === 'mech' && <MechNodeBody id={focus.id} onNavigate={onNavigate} />}
    </div>
  );
}

function NodeOpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 8,
        background: 'var(--c-purple)',
        color: 'white',
        border: 'none',
        padding: '6px 12px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}

function SourceNodeBody({ id, onNavigate }: { id: string; onNavigate: (v: View) => void }) {
  const [info, setInfo] = useState<SnapshotInfo | null>(null);
  useEffect(() => {
    api.snapshotInfo().then(setInfo).catch(() => {});
  }, [id]);

  const cols = info?.columns_per[id];
  const rows = info?.rows_per[id];
  return (
    <div>
      <h3 style={H3}>{id}</h3>
      <div style={{ fontSize: 12, color: 'var(--c-gray)', marginBottom: 4 }}>
        {rows !== undefined ? `${rows.toLocaleString()} rows` : '…'} ·{' '}
        {cols ? `${cols.length} columns` : '…'}
      </div>
      <NodeOpenButton label="Open Source viewer →" onClick={() => onNavigate({ type: 'source', table: id })} />
      <h4 style={H4}>Columns</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
        {cols?.map((c) => (
          <li
            key={c.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '4px 0',
              borderBottom: '1px solid var(--c-border)',
            }}
          >
            <span>{c.name}</span>
            <span style={{ color: 'var(--c-gray)', fontSize: 11 }}>{c.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlusNodeBody({ id, onNavigate }: { id: string; onNavigate: (v: View) => void }) {
  const [meta, setMeta] = useState<PlusMeta | null>(null);
  useEffect(() => {
    api
      .plusInfo()
      .then((info) => setMeta(info.meta[id] ?? null))
      .catch(() => {});
  }, [id]);
  if (!meta) return <div style={{ color: 'var(--c-gray)' }}>loading…</div>;

  const raw = meta.columns.filter((c) => c.tier === 'raw');
  const derived = meta.columns.filter((c) => c.tier === 'tab_derived');
  const downstream = biConsumingPlus(id);
  return (
    <div>
      <h3 style={H3}>{meta.label}</h3>
      <div style={{ fontSize: 11, color: 'var(--c-gray)', marginBottom: 6 }}>
        src: <code>{meta.source_table}</code> · {raw.length} raw + {derived.length} derived
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-white)', lineHeight: 1.4, marginBottom: 8 }}>
        {meta.description}
      </div>
      <NodeOpenButton label="Open Plus viewer →" onClick={() => onNavigate({ type: 'plus', table: id })} />

      <ColumnGroup heading={`Derived metrics (${derived.length})`} tier="tab_derived" columns={derived} />
      <ColumnGroup heading={`Raw source columns (${raw.length})`} tier="raw" columns={raw} />

      <h4 style={H4}>Feeds these BI dashboards</h4>
      {downstream.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--c-gray)' }}>None — no BI dashboard wired yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
          {downstream.map((b) => (
            <li key={b.id} style={LI_DOWN}>
              <strong>{b.label}</strong>
              <span style={{ color: 'var(--c-gray)', fontSize: 10 }}>{b.phase}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BiNodeBody({ id, onNavigate }: { id: string; onNavigate: (v: View) => void }) {
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => {
    setMeta(null);
    setNotFound(false);
    api
      .biInfo()
      .then((info) => {
        if (info.meta[id]) setMeta(info.meta[id]);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) return <div style={{ color: 'var(--c-gray)' }}>BI dashboard <code>{id}</code> not built yet.</div>;
  if (!meta) return <div style={{ color: 'var(--c-gray)' }}>loading…</div>;

  const downstream = mechConsumingBi(id);
  const biDerived = meta.columns.filter((c) => c.tier === 'bi_derived');
  const flagged = meta.columns.filter((c) => c.flag_rule !== null);
  return (
    <div>
      <h3 style={H3}>{meta.label}</h3>
      <div style={{ fontSize: 11, color: 'var(--c-gray)', marginBottom: 8 }}>
        BI dashboard · {meta.upstream_plus.length} upstream · {biDerived.length} bi-derived · {flagged.length} flagged
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-white)', lineHeight: 1.4, marginBottom: 8 }}>
        {meta.description}
      </div>
      <NodeOpenButton label="Open BI viewer →" onClick={() => onNavigate({ type: 'bi', id })} />

      <h4 style={H4}>Composed from Plus tabs</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
        {meta.upstream_plus.map((pid) => (
          <li key={pid} style={LI_UP}>
            <code>{pid}</code>
          </li>
        ))}
      </ul>

      <h4 style={H4}>Feeds these mechanics</h4>
      {downstream.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--c-gray)' }}>None.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
          {downstream.map((m) => (
            <li key={m.id} style={LI_DOWN}>
              <strong>{m.label}</strong>
              <span style={{ color: 'var(--c-gray)', fontSize: 10 }}>{m.phase}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --------- BiHelper (open a BI table view) ----------
// Collapsible sections: Title · Description · Sources · Columns · Formulas · Conditional Logic · Takeaways.

type BiSection =
  | 'description'
  | 'sources'
  | 'columns'
  | 'formulas'
  | 'conditional'
  | 'takeaways'
  | 'improvements';
// Only Formulas open by default — everything else collapses for a quieter
// landing. Jack toggles per-session; no localStorage persistence.
const DEFAULT_BI_SECTIONS: Record<BiSection, boolean> = {
  description: false,
  sources: false,
  columns: false,
  formulas: true,
  conditional: false,
  takeaways: false,
  improvements: false,
};

function BiHelper({ biId, onNavigate }: { biId: string; onNavigate: (v: View) => void }) {
  const [meta, setMeta] = useState<BiMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<BiSection, boolean>>(DEFAULT_BI_SECTIONS);

  useEffect(() => {
    setMeta(null);
    api
      .biInfo()
      .then((info) => {
        if (info.meta[biId]) setMeta(info.meta[biId]);
        else setErr(`unknown BI dashboard: ${biId}`);
      })
      .catch((e) => setErr(String(e)));
  }, [biId]);

  if (err) return <div style={{ color: 'var(--c-flag-red)' }}>{err}</div>;
  if (!meta) return <div style={{ color: 'var(--c-gray)' }}>loading…</div>;

  function toggle(s: BiSection) {
    setOpen((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  const biDerived = meta.columns.filter((c) => c.tier === 'bi_derived');
  const tabDerived = meta.columns.filter((c) => c.tier === 'tab_derived');
  const raw = meta.columns.filter((c) => c.tier === 'raw');
  const formulaCols = meta.columns.filter((c) => c.formula !== null);
  const flaggedCols = meta.columns.filter((c) => c.flag_rule !== null);

  return (
    <div>
      {/* Title */}
      <h3 style={{ margin: '0 0 4px', fontSize: 16, color: 'var(--c-white)' }}>{meta.label}</h3>
      <div style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--c-gray)', fontWeight: 700, marginBottom: 12 }}>
        BI DASHBOARD · {meta.upstream_plus.length} UPSTREAM · {biDerived.length} BI-DERIVED · {flaggedCols.length} FLAGGED
      </div>

      <Section label="Description" open={open.description} onToggle={() => toggle('description')}>
        <div style={{ fontSize: 12, color: 'var(--c-white)', lineHeight: 1.45 }}>{meta.description}</div>
      </Section>

      <Section label={`Sources (${meta.upstream_plus.length})`} open={open.sources} onToggle={() => toggle('sources')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {meta.upstream_plus.map((pid) => (
            <span
              key={pid}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                background: 'var(--c-tier-tab-derived)',
                borderRadius: 3,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                color: 'var(--c-teal)',
              }}
            >
              {pid}+
            </span>
          ))}
        </div>
      </Section>

      <Section label={`Columns (${meta.columns.length})`} open={open.columns} onToggle={() => toggle('columns')}>
        <BiColumnList heading={`BI-derived (${biDerived.length})`} tier="bi_derived" columns={biDerived} />
        <BiColumnList heading={`Tab+ derived (${tabDerived.length})`} tier="tab_derived" columns={tabDerived} />
        <BiColumnList heading={`Raw (${raw.length})`} tier="raw" columns={raw} />
      </Section>

      <Section label={`Formulas (${formulaCols.length})`} open={open.formulas} onToggle={() => toggle('formulas')}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
          {formulaCols.map((c) => (
            <li key={c.name} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 11 }}>{c.name}</div>
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 10,
                  color: 'var(--c-teal)',
                  background: 'rgba(255,255,255,0.06)',
                  padding: '3px 6px',
                  borderRadius: 3,
                  marginTop: 2,
                  whiteSpace: 'normal',
                  lineHeight: 1.35,
                }}
              >
                ƒ {c.formula}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        label={`Conditional Logic (${flaggedCols.length})`}
        open={open.conditional}
        onToggle={() => toggle('conditional')}
      >
        {flaggedCols.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--c-gray)' }}>No flag rules on this dashboard.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
            {flaggedCols.map((c) => {
              const rule = c.flag_rule!;
              const isNone = rule.kind === 'none';
              return (
                <li key={c.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    {isNone ? (
                      <span
                        style={{
                          fontSize: 9,
                          color: 'var(--c-gray)',
                          padding: '1px 5px',
                          border: '1px solid var(--c-border)',
                          borderRadius: 3,
                        }}
                      >
                        no flag
                      </span>
                    ) : (
                      <FlagChipsInline />
                    )}
                    <strong style={{ fontSize: 11 }}>{c.name}</strong>
                    <span
                      style={{
                        fontSize: 9,
                        color: 'var(--c-gray)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                        marginLeft: 'auto',
                      }}
                    >
                      {rule.kind}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--c-white)',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '3px 6px',
                      borderRadius: 3,
                      lineHeight: 1.35,
                    }}
                  >
                    {rule.legend}
                  </div>
                  {rule.rationale && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--c-gray)',
                        padding: '4px 6px 0 6px',
                        lineHeight: 1.4,
                        fontStyle: 'italic',
                      }}
                    >
                      {rule.rationale}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section label={`Takeaways (${meta.takeaways.length})`} open={open.takeaways} onToggle={() => toggle('takeaways')}>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.45 }}>
          {meta.takeaways.map((t, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        label={`Ontology Improvements (${meta.ontology_improvements?.length ?? 0})`}
        open={open.improvements}
        onToggle={() => toggle('improvements')}
      >
        {meta.ontology_improvements && meta.ontology_improvements.length > 0 ? (
          <OntologyImprovementsList items={meta.ontology_improvements} onNavigate={onNavigate} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--c-gray)' }}>
            No catalog items reference this dashboard.
          </div>
        )}
      </Section>
    </div>
  );
}

// --------- Ontology Improvements shared component ----------
// Used by BiHelper (per-BI view) and MechNodeBody (cross-BI aggregation).
// Groups items by capability_group tier; each item shows its DAG context
// (NEEDS → UNLOCKS) so the dependency chain is visible at a glance.

const CAP_GROUP_ORDER = [
  'ingest_foundation', 'diagnostic_chain', 'terminal_action', 'operational_win',
] as const;

const CAP_GROUP_META: Record<string, { label: string; color: string }> = {
  ingest_foundation: { label: 'Platform Foundation', color: '#8EA2FF' },
  diagnostic_chain:  { label: 'Diagnostic Upgrades',  color: '#38BDF8' },
  terminal_action:   { label: 'Terminal Actions',      color: '#4CCB7F' },
  operational_win:   { label: 'Operational Wins',      color: '#B18CFF' },
};


function shortDepTitle(id: string, enrichedById: Record<string, EnrichedImprovement>, maxLen = 22): string {
  const title = enrichedById[id]?.title;
  if (!title) return id;
  if (title.length <= maxLen) return title;
  const cut = title.slice(0, maxLen);
  const sp = cut.lastIndexOf(' ');
  return (sp > 8 ? cut.slice(0, sp) : cut) + '…';
}

const PANEL_STATUS_COLOR: Record<string, string> = {
  Ready: '#4CCB7F', 'In-Progress': '#86C6CA',
  Blocked: 'var(--c-flag-red)', Backlog: 'var(--c-gray)', Shipped: '#4CCB7F',
};

function tint(color: string, pct = 16): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function OntologyImprovementsList({ items, onNavigate }: { items: OntologyImprovement[]; onNavigate: (v: View) => void }) {
  const [enrichedById, setEnrichedById] = useState<Record<string, EnrichedImprovement>>({});

  useEffect(() => {
    api.improvementsAll().then(d => {
      const m: Record<string, EnrichedImprovement> = {};
      for (const it of d.items) m[it.id] = it;
      setEnrichedById(m);
    }).catch(() => {});
  }, []);

  // Group by capability_group in tier order; items pre-sorted by server.
  const grouped: Record<string, OntologyImprovement[]> = {
    ingest_foundation: [], diagnostic_chain: [], terminal_action: [], operational_win: [],
  };
  for (const it of items) {
    const grp = it.capability_group ?? 'diagnostic_chain';
    (grouped[grp] ??= []).push(it);
  }
  const sections = CAP_GROUP_ORDER.filter(g => grouped[g].length > 0);

  return (
    <div style={{ fontSize: 12 }}>
      {sections.map(grp => {
        const { label, color } = CAP_GROUP_META[grp];
        return (
          <div key={grp} style={{ marginBottom: 14 }}>
            {/* Tier header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <div style={{ width: 10, height: 2, background: color, borderRadius: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color }}>
                {label}
              </span>
              <span style={{ fontSize: 9, color: 'var(--c-gray)' }}>({grouped[grp].length})</span>
              <div style={{ flex: 1, height: 1, background: `${color}30` }} />
            </div>
            {/* Items */}
            {grouped[grp].map(it => {
              const enriched = enrichedById[it.id];
              const status = enriched?.status;
              const statusColor = status ? (PANEL_STATUS_COLOR[status] ?? 'var(--c-gray)') : null;
              return (
                <div
                  key={it.id}
                  onClick={() => onNavigate({ type: 'tasks', selectedImprovementId: it.id })}
                  style={{
                    marginBottom: 8,
                    padding: '8px 10px',
                    borderLeft: `3px solid ${color}`,
                    background: `${color}09`,
                    borderRadius: '0 4px 4px 0',
                    cursor: 'pointer',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${color}1a`)}
                  onMouseLeave={e => (e.currentTarget.style.background = `${color}09`)}
                >
                  {/* Title + badges */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                    {statusColor && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 3, background: statusColor }} />
                    )}
                    <strong style={{ fontSize: 12, lineHeight: 1.25, flex: 1 }}>{it.title}</strong>
                  </div>
                  {/* Chips row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: (it.depends_on.length > 0 || it.unlocks.length > 0) ? 5 : 0 }}>
                    {status && statusColor && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10,
                        color: statusColor, border: `1px solid ${tint(statusColor, 48)}`, background: tint(statusColor, 16),
                      }}>{status}</span>
                    )}
                    <PriorityChip priority={it.priority} />
                    <EffortChip effort={it.effort} />
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10,
                      color, border: `1px solid ${tint(color, 48)}`, background: tint(color, 16),
                    }}>
                      {CAP_GROUP_META[it.capability_group]?.label ?? it.capability_group}
                    </span>
                  </div>
                  {/* DAG row — human titles, clickable */}
                  {(it.depends_on.length > 0 || it.unlocks.length > 0) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {it.depends_on.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gray)', letterSpacing: '0.05em' }}>NEEDS</span>
                          {it.depends_on.map(d => (
                            <span
                              key={d}
                              title={enrichedById[d]?.title ?? d}
                              onClick={e => { e.stopPropagation(); onNavigate({ type: 'tasks', selectedImprovementId: d }); }}
                              style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
                                background: '#ef444412', border: '1px solid #ef444430', color: '#ef4444',
                              }}
                            >
                              {shortDepTitle(d, enrichedById)}
                            </span>
                          ))}
                        </div>
                      )}
                      {it.unlocks.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-gray)', letterSpacing: '0.05em' }}>UNLOCKS</span>
                          {it.unlocks.map(u => (
                            <span
                              key={u}
                              title={enrichedById[u]?.title ?? u}
                              onClick={e => { e.stopPropagation(); onNavigate({ type: 'tasks', selectedImprovementId: u }); }}
                              style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
                                background: '#4CCB7F20', border: '1px solid #4CCB7F44', color: '#4CCB7F',
                              }}
                            >
                              {shortDepTitle(u, enrichedById)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}


const PRIORITY_STYLES: Record<ImprovementPriority, { bg: string; fg: string }> = {
  P0: { bg: 'var(--c-flag-red)',    fg: '#FFFFFF' },
  P1: { bg: 'var(--c-flag-yellow)', fg: '#1A1A2E' },
  P2: { bg: 'var(--c-border)',              fg: '#FFFFFF' },
};
const EFFORT_STYLES: Record<ImprovementEffort, { bg: string; fg: string }> = {
  S: { bg: 'var(--c-flag-green)',  fg: '#FFFFFF' },
  M: { bg: 'var(--c-flag-yellow)', fg: '#1A1A2E' },
  L: { bg: 'var(--c-border)',              fg: '#FFFFFF' },
};

function PriorityChip({ priority }: { priority: ImprovementPriority }) {
  const s = PRIORITY_STYLES[priority];
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 3,
        background: s.bg,
        color: s.fg,
        letterSpacing: 0.3,
      }}
      title={`${priority} — priority tier`}
    >
      {priority}
    </span>
  );
}

function EffortChip({ effort }: { effort: ImprovementEffort }) {
  const s = EFFORT_STYLES[effort];
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 3,
        background: s.bg,
        color: s.fg,
        letterSpacing: 0.3,
      }}
      title={`${effort} — effort tier`}
    >
      {effort}
    </span>
  );
}

function Section({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12, borderTop: '1px solid var(--c-border)' }}>
      <button
        onClick={onToggle}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '10px 0 6px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: 'var(--c-gray)',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 10, opacity: 0.7, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 120ms ease' }}>
          ▶
        </span>
      </button>
      {open && <div style={{ padding: '2px 0 8px' }}>{children}</div>}
    </div>
  );
}

function FlagChipsInline() {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <span style={{ width: 8, height: 8, background: 'var(--c-flag-green)', borderRadius: 2 }} />
      <span style={{ width: 8, height: 8, background: 'var(--c-flag-yellow)', borderRadius: 2 }} />
      <span style={{ width: 8, height: 8, background: 'var(--c-flag-red)', borderRadius: 2 }} />
    </span>
  );
}

function BiColumnList({
  heading,
  tier,
  columns,
}: {
  heading: string;
  tier: 'raw' | 'tab_derived' | 'bi_derived';
  columns: BiColumn[];
}) {
  if (columns.length === 0) return null;
  const tierBg =
    tier === 'bi_derived'
      ? 'var(--c-tier-bi-derived)'
      : tier === 'tab_derived'
        ? 'var(--c-tier-tab-derived)'
        : 'var(--c-tier-raw)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--c-gray)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ width: 8, height: 8, background: tierBg, border: '1px solid #C7C2F0', borderRadius: 2 }} />
        {heading}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 11 }}>
        {columns.map((c) => (
          <li
            key={c.name}
            style={{
              padding: '4px 6px',
              margin: '2px 0',
              borderLeft: `3px solid ${tierBg}`,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <span style={{ color: 'var(--c-gray)', fontSize: 9 }}>{c.type}</span>
            </div>
            <div style={{ color: 'var(--c-gray)', fontSize: 10, fontStyle: 'italic', marginTop: 1 }}>
              {c.description}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MechNodeBody({ id, onNavigate }: { id: string; onNavigate: (v: View) => void }) {
  const m = MECH_BY_ID[id];
  const [mechImprovements, setMechImprovements] = useState<MechanicImprovements | null>(null);
  const [mechErr, setMechErr] = useState<string | null>(null);

  useEffect(() => {
    setMechImprovements(null);
    setMechErr(null);
    api
      .improvementsByMechanic(id)
      .then(setMechImprovements)
      .catch((e) => setMechErr(String(e)));
  }, [id]);

  if (!m) return <div style={{ color: 'var(--c-flag-red)' }}>Unknown mechanic: {id}</div>;
  // Mechanic page is the primary surface — backend META is the source of truth
  // for utility / logic / insights / algorithms / weaknesses. RightPanel only
  // shows the lineage breadcrumb + cross-BI improvements aggregation.
  // `red_count` ships in Phase 1; the rest enable in Phases 2-6.
  const pageShipped = id === 'red_count';
  return (
    <div>
      <h3 style={H3}>{m.label}</h3>
      <div style={{ fontSize: 11, color: 'var(--c-gray)', marginBottom: 12 }}>
        Mechanic · {m.phase}
      </div>

      {pageShipped && (
        <NodeOpenButton
          label={`Open ${m.label} →`}
          onClick={() => onNavigate({ type: 'mech', id })}
        />
      )}

      <h4 style={H4}>Composed from BI dashboards</h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
        {m.bi.map((bid) => (
          <li key={bid} style={LI_UP}>
            <strong>{BI_BY_ID[bid]?.label ?? bid}</strong>
          </li>
        ))}
      </ul>

      <h4 style={H4}>
        Ontology Improvements{mechImprovements ? ` (${mechImprovements.improvements.length})` : ''}
      </h4>
      {mechErr && <div style={{ fontSize: 11, color: 'var(--c-flag-red)' }}>{mechErr}</div>}
      {!mechErr && !mechImprovements && (
        <div style={{ fontSize: 11, color: 'var(--c-gray)' }}>loading…</div>
      )}
      {mechImprovements && mechImprovements.improvements.length > 0 && (
        <>
          {mechImprovements.contributing_bi_ids.length > 0 && (
            <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--c-gray)' }}>surfaces in:</span>
              {mechImprovements.contributing_bi_ids.map((bid) => (
                <span
                  key={bid}
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    background: 'var(--c-tier-bi-derived)',
                    borderRadius: 3,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    color: 'var(--c-teal)',
                  }}
                >
                  {BI_BY_ID[bid]?.label ?? bid}
                </span>
              ))}
            </div>
          )}
          <OntologyImprovementsList items={mechImprovements.improvements} onNavigate={onNavigate} />
        </>
      )}
      {mechImprovements && mechImprovements.improvements.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--c-gray)', fontStyle: 'italic' }}>
          No catalog items for this mechanic yet.
        </div>
      )}
    </div>
  );
}

const H3: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: 16,
  color: 'var(--c-white)',
};
const H4: React.CSSProperties = {
  margin: '14px 0 6px',
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--c-gray)',
  fontWeight: 700,
  letterSpacing: 0.5,
};
const LI_UP: React.CSSProperties = {
  padding: '5px 8px',
  margin: '2px 0',
  borderLeft: '3px solid var(--c-tier-tab-derived)',
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 3,
};
const LI_DOWN: React.CSSProperties = {
  padding: '5px 8px',
  margin: '2px 0',
  borderLeft: '3px solid var(--c-tier-bi-derived)',
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 3,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
};

function TierLegend() {
  const items = [
    { label: 'raw (source)', bg: 'var(--c-tier-raw)' },
    { label: 'tab-derived (plus)', bg: 'var(--c-tier-tab-derived)' },
    { label: 'bi-derived', bg: 'var(--c-tier-bi-derived)' },
  ];
  return (
    <div>
      <h4
        style={{
          margin: '0 0 6px',
          fontSize: 11,
          textTransform: 'uppercase',
          color: 'var(--c-gray)',
        }}
      >
        Tier legend
      </h4>
      {items.map((i) => (
        <div
          key={i.label}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              background: i.bg,
              border: '1px solid var(--c-border)',
              borderRadius: 2,
            }}
          />
          {i.label}
        </div>
      ))}
    </div>
  );
}

// ─── Task Detail Helper ───────────────────────────────────────────────────────

const TASK_PRIORITY_COLOR: Record<string, string> = {
  P0: 'var(--c-flag-red)',
  P1: 'var(--c-flag-yellow)',
  P2: 'var(--c-gray)',
};
const TASK_EFFORT_LABEL: Record<string, string> = { S: 'Config', M: 'Pipeline', L: 'Platform' };
const TASK_TIER_COLOR: Record<string, string> = {
  Large: '#4CCB7F', Medium: '#86C6CA', Small: 'var(--c-gray)', Unsized: 'var(--c-gray)',
};
const TASK_STATUS_COLOR: Record<string, string> = {
  Ready: '#4CCB7F', 'In-Progress': '#86C6CA',
  Blocked: 'var(--c-flag-red)', Backlog: 'var(--c-gray)', Shipped: 'var(--c-flag-green)',
};

function toBullets(text: string | null | undefined): string[] {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return parts.map(s => s.trim()).filter(Boolean);
}

function TaskBadge({ text, color, title }: { text: string; color: string; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`, whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

function TaskField({ label, text }: { label: string; text: string | null | undefined }) {
  const bullets = toBullets(text);
  if (bullets.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: 'var(--c-gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </p>
      {bullets.length > 1 ? (
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.6 }}>
          {bullets.map((b, i) => <li key={i} style={{ marginBottom: 2 }}>{b}</li>)}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{text}</p>
      )}
    </div>
  );
}

function TaskDetailHelper({
  improvementId,
  onNavigate,
  defaultMessage,
}: {
  improvementId: string | undefined;
  onNavigate: (v: View) => void;
  defaultMessage?: string;
}) {
  const [items, setItems] = useState<EnrichedImprovement[] | null>(null);

  useEffect(() => {
    api.improvementsAll().then(d => setItems(d.items)).catch(() => setItems([]));
  }, []);

  if (!improvementId) {
    return (
      <p style={{ fontSize: 12, color: 'var(--c-gray)', margin: 0 }}>
        {defaultMessage ?? 'Click any card in the kanban to see details here.'}
      </p>
    );
  }

  if (!items) return <p style={{ fontSize: 12, color: 'var(--c-gray)' }}>Loading…</p>;

  const item = items.find(i => i.id === improvementId);
  if (!item) return <p style={{ fontSize: 12, color: 'var(--c-gray)' }}>Not found.</p>;

  const itemById = Object.fromEntries(items.map(it => [it.id, it]));
  const biDashboards = item.bi_ids.map(id => BI_BY_ID[id]).filter(Boolean);
  const mechanic = MECH_BY_ID[item.mechanic];

  const CAP_COLOR: Record<string, string> = {
    ingest_foundation: '#8EA2FF',
    diagnostic_chain:  '#38BDF8',
    terminal_action:   '#4CCB7F',
    operational_win:   '#B18CFF',
  };
  const capColor = CAP_COLOR[item.capability_group] ?? 'var(--c-gray)';

  function depLabel(id: string, maxLen = 26): string {
    const t = itemById[id]?.title;
    if (!t) return id;
    if (t.length <= maxLen) return t;
    const cut = t.slice(0, maxLen);
    const sp = cut.lastIndexOf(' ');
    return (sp > 10 ? cut.slice(0, sp) : cut) + '…';
  }

  return (
    <div>
      {/* Mechanic origin link — top of panel */}
      {mechanic && (
        <button
          onClick={() => onNavigate({ type: 'mech', id: mechanic.id })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            textAlign: 'left', marginBottom: 12,
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
            borderRadius: 5, padding: '6px 8px', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--c-teal)', letterSpacing: '0.05em', flexShrink: 0 }}>MECHANIC</span>
          <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{mechanic.label}</span>
          <span style={{ fontSize: 10, color: 'var(--c-gray)' }}>→</span>
        </button>
      )}

      {/* Title */}
      <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
        {item.title}
      </h3>

      {/* Badges + status inline */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10, alignItems: 'center' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 10,
          fontSize: 11, fontWeight: 700,
          color: TASK_STATUS_COLOR[item.status] ?? 'var(--c-gray)',
          background: tint(TASK_STATUS_COLOR[item.status] ?? 'var(--c-gray)', 18),
          border: `1px solid ${tint(TASK_STATUS_COLOR[item.status] ?? 'var(--c-gray)', 48)}`,
        }}>{item.status}</span>
        <TaskBadge text={item.priority} color={TASK_PRIORITY_COLOR[item.priority] ?? 'var(--c-gray)'} title="Priority" />
        <TaskBadge text={TASK_EFFORT_LABEL[item.effort] ?? item.effort} color="var(--c-gray)" title="Effort" />
        {item.revenue_impact_tier !== 'Unsized' && (
          <TaskBadge text={item.revenue_impact_tier} color={TASK_TIER_COLOR[item.revenue_impact_tier] ?? 'var(--c-gray)'} title="Revenue impact" />
        )}
        <span style={{
          fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
          border: `1px solid ${tint(capColor, 48)}`, background: tint(capColor, 16), color: capColor,
        }}>
          {item.capability_group.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Dependencies — top of detail */}
      {(item.depends_on.length > 0 || item.unlocks.length > 0) && (
        <div style={{ marginBottom: 12, padding: '10px 10px 8px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 6 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'var(--c-gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Dependencies
          </p>
          {item.depends_on.length > 0 && (
            <div style={{ marginBottom: item.unlocks.length > 0 ? 8 : 0 }}>
              <p style={{ margin: '0 0 5px', fontSize: 10, color: '#ef4444', fontWeight: 700 }}>Blocked by</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {item.depends_on.map(depId => (
                  <button
                    key={depId}
                    title={itemById[depId]?.title ?? depId}
                    onClick={() => onNavigate({ type: 'tasks', selectedImprovementId: depId })}
                    style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid #ef444444', background: '#ef444412',
                      color: '#ef4444', fontWeight: 600,
                    }}
                  >
                    {depLabel(depId)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {item.unlocks.length > 0 && (
            <div>
              <p style={{ margin: '0 0 5px', fontSize: 10, color: '#4CCB7F', fontWeight: 700 }}>Unlocks</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {item.unlocks.map(uid => (
                  <button
                    key={uid}
                    title={itemById[uid]?.title ?? uid}
                    onClick={() => onNavigate({ type: 'tasks', selectedImprovementId: uid })}
                    style={{
                      fontSize: 11, padding: '3px 9px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid #4CCB7F55', background: '#4CCB7F20',
                      color: '#4CCB7F', fontWeight: 600,
                    }}
                  >
                    {depLabel(uid)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scope — also near top */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {item.cross_mechanic_impact.map(mid => (
          <span key={mid} style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
            border: `1px solid ${tint('var(--c-teal)', 48)}`, background: tint('var(--c-teal)', 16), color: 'var(--c-teal)',
          }}>{mid}</span>
        ))}
        {item.bi_ids.map(bid => (
          <span key={bid} style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
            border: '1px solid #86C6CA55', background: '#86C6CA18', color: '#86C6CA',
          }}>{BI_BY_ID[bid]?.label ?? bid}</span>
        ))}
      </div>

      {/* Text fields */}
      <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14, marginBottom: 4 }}>
        <TaskField label="Current weakness" text={item.current_weakness} />
        <TaskField label="Ontology fix" text={item.ontology_fix} />
        <TaskField label="Output value" text={item.output_value} />
        <TaskField label="Implementation" text={item.how_ontology_uses} />
        {item.revenue_opportunity && (
          <TaskField label="Revenue opportunity" text={item.revenue_opportunity} />
        )}
        {item.retailer_action && (
          <div style={{
            borderLeft: '3px solid #f59e0b', background: '#fef3c720',
            padding: '8px 12px', borderRadius: '0 4px 4px 0', marginBottom: 14,
          }}>
            <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Retailer action required
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{item.retailer_action}</p>
          </div>
        )}
      </div>

      {/* Navigation links */}
      {(biDashboards.length > 0 || mechanic) && (
        <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'var(--c-gray)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Related pages
          </p>

          {mechanic && (
            <button
              onClick={() => onNavigate({ type: 'mech', id: mechanic.id })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left', marginBottom: 6,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 5, padding: '6px 8px', cursor: 'pointer',
                color: 'var(--c-white)',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-teal)', flexShrink: 0 }}>M</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-white)' }}>{mechanic.label}</span>
              <span style={{ fontSize: 10, color: 'var(--c-gray)', marginLeft: 'auto' }}>→</span>
            </button>
          )}

          {biDashboards.map(bi => (
            <button
              key={bi.id}
              onClick={() => onNavigate({ type: 'bi', id: bi.id })}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                width: '100%', textAlign: 'left', marginBottom: 6,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 5, padding: '6px 8px', cursor: 'pointer',
                color: 'var(--c-white)',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: '#86C6CA', flexShrink: 0 }}>BI</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-white)' }}>{bi.label}</span>
              <span style={{ fontSize: 10, color: 'var(--c-gray)', marginLeft: 'auto' }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TriggerHelper() {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>2-Week Notice Trigger</h3>
      <p style={{ fontSize: 12, color: 'var(--c-gray)', lineHeight: 1.5, margin: '0 0 10px' }}>
        Click a row in the Bulletproofing table to see full improvement details here.
      </p>
    </div>
  );
}
