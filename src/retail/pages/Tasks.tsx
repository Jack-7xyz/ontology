// Tasks — Improvements kanban. 4 columns = capability tiers = dependency order.
// Hover any card: cards it NEEDS pulse red, cards it UNLOCKS pulse green.
// Click a card → right panel shows full detail.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { EnrichedImprovement } from '../api/client';
import type { View } from '../types';

interface Props {
  view: Extract<View, { type: 'tasks' }>;
  onNavigate: (v: View) => void;
}

const COLUMNS: { key: string; label: string; color: string; sub: string }[] = [
  {
    key:   'ingest_foundation',
    label: 'Platform Foundation',
    color: '#8EA2FF',
    sub:   'Root — no deps',
  },
  {
    key:   'diagnostic_chain',
    label: 'Diagnostic Upgrades',
    color: '#38BDF8',
    sub:   'Pattern → audit',
  },
  {
    key:   'terminal_action',
    label: 'Terminal Actions',
    color: '#4CCB7F',
    sub:   'Full capability',
  },
  {
    key:   'operational_win',
    label: 'Operational Wins',
    color: '#B18CFF',
    sub:   'Ships on existing data',
  },
];

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'var(--c-flag-red)',
  P1: 'var(--c-flag-yellow)',
  P2: 'var(--c-gray)',
};

const EFFORT_LABEL: Record<string, string> = {
  S: 'Config',
  M: 'Pipeline',
  L: 'Platform',
};

const STATUS_COLOR: Record<string, string> = {
  Ready:         '#4CCB7F',
  'In-Progress': '#86C6CA',
  Blocked:       'var(--c-flag-red)',
  Backlog:       'var(--c-gray)',
  Shipped:       '#4CCB7F',
};

const MECH_SHORT: Record<string, string> = {
  red_count:         'M1',
  rev_decomp:        'M2',
  attr_gap:          'M3',
  hg_processor:      'M4',
  perf_flag_cascade: 'M5',
  fine_rev:          'M6',
  platform:          'Plt',
};

function Chip({
  text,
  color,
  title,
  onClick,
}: {
  text: string;
  color: string;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      title={title ?? text}
      onClick={onClick}
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        color,
        border: `1px solid color-mix(in srgb, ${color} 48%, transparent)`,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: onClick ? 'ui-monospace, Menlo, monospace' : 'inherit',
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {text}
    </span>
  );
}

function shortTitle(id: string, itemById: Record<string, EnrichedImprovement>, maxLen = 24): string {
  const title = itemById[id]?.title;
  if (!title) return id;
  if (title.length <= maxLen) return title;
  const cut = title.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 10 ? cut.slice(0, lastSpace) : cut) + '…';
}

function sortItems(items: EnrichedImprovement[]): EnrichedImprovement[] {
  const statusRank: Record<string, number> = {
    Ready: 0, 'In-Progress': 1, Blocked: 2, Backlog: 3, Shipped: 4,
  };
  const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  return [...items].sort((a, b) => {
    const sr = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (sr !== 0) return sr;
    return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
  });
}

export function Tasks({ view, onNavigate }: Props) {
  const [allItems, setAllItems] = useState<EnrichedImprovement[] | null>(null);
  const [err, setErr]           = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const selectedId = view.selectedImprovementId;

  useEffect(() => {
    api.improvementsAll('priority')
      .then(d => setAllItems(d.items))
      .catch(e => setErr(String(e)));
  }, []);

  const itemById = useMemo(() => {
    const m: Record<string, EnrichedImprovement> = {};
    for (const it of allItems ?? []) m[it.id] = it;
    return m;
  }, [allItems]);

  const grouped = useMemo(() => {
    const g: Record<string, EnrichedImprovement[]> = {
      ingest_foundation: [],
      diagnostic_chain:  [],
      terminal_action:   [],
      operational_win:   [],
    };
    for (const it of allItems ?? []) {
      const key = it.capability_group ?? 'diagnostic_chain';
      (g[key] ??= []).push(it);
    }
    for (const col of COLUMNS) g[col.key] = sortItems(g[col.key] ?? []);
    return g;
  }, [allItems]);

  function selectRow(id: string) {
    onNavigate({
      type: 'tasks',
      selectedImprovementId: id === selectedId ? undefined : id,
    });
  }

  // Hover DAG highlight — only active when hoveredId is set.
  // Selected state is rendered separately so it never blocks hover colors.
  function dagHighlight(item: EnrichedImprovement): 'self' | 'needs' | 'unlocks' | null {
    if (!hoveredId) return null;
    if (item.id === hoveredId) return 'self';
    const h = itemById[hoveredId];
    if (!h) return null;
    if (h.depends_on.includes(item.id)) return 'needs';
    if (h.unlocks.includes(item.id)) return 'unlocks';
    return null;
  }

  if (err) return <div style={{ color: 'var(--c-flag-red)', padding: 24 }}>{err}</div>;
  if (!allItems) return <div style={{ padding: 24, color: 'var(--c-gray)', fontSize: 13 }}>Loading…</div>;

  const readyCount   = allItems.filter(i => i.status === 'Ready').length;
  const blockedCount = allItems.filter(i => i.status === 'Blocked').length;
  const backlogCount = allItems.length - readyCount - blockedCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Ontology Improvements Roadmap</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--c-gray)' }}>
            {allItems.length} improvements · hover to trace dependencies · click for detail
          </span>
          <Chip text={`${readyCount} Ready`}   color="#4CCB7F" />
          <Chip text={`${blockedCount} Blocked`} color="var(--c-flag-red)" />
          <Chip text={`${backlogCount} Backlog`} color="var(--c-gray)" />
        </div>
      </div>

      {/* ── Kanban board ───────────────────────────────────────── */}
      <div
        onClick={() => selectedId && onNavigate({ type: 'tasks' })}
        style={{
          flex: 1,
          display: 'flex',
          gap: 10,
          overflowX: 'auto',
          overflowY: 'hidden',
          alignItems: 'flex-start',
          paddingBottom: 8,
          minWidth: 0,
        }}
      >
        {COLUMNS.map((col, colIdx) => {
          const items = grouped[col.key] ?? [];
          return (
            <div
              key={col.key}
              style={{
                flex: '1 1 240px',
                minWidth: 210,
                maxWidth: 380,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                minHeight: 0,
              }}
            >
              {/* Column header */}
              <div style={{
                flexShrink: 0,
                padding: '8px 10px 7px',
                borderRadius: '6px 6px 0 0',
                background: `${col.color}14`,
                borderTop: `3px solid ${col.color}`,
                borderLeft: `1px solid ${col.color}30`,
                borderRight: `1px solid ${col.color}30`,
                marginBottom: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {colIdx > 0 && (
                    <span style={{ fontSize: 11, color: `${col.color}90`, flexShrink: 0 }}>→</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, color: col.color }}>{col.label}</span>
                  <span style={{
                    fontSize: 10, color: 'var(--c-gray)',
                    background: 'var(--c-border)', borderRadius: 10, padding: '0 5px', flexShrink: 0,
                  }}>
                    {items.length}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: `${col.color}90`, marginTop: 2, letterSpacing: '0.02em' }}>
                  {col.sub}
                </div>
              </div>

              {/* Cards */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '6px 0 0',
                border: `1px solid ${col.color}25`,
                borderTop: 'none',
                borderRadius: '0 0 6px 6px',
                background: `${col.color}05`,
                paddingLeft: 6,
                paddingRight: 6,
                paddingBottom: 6,
              }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--c-gray)', textAlign: 'center', padding: '16px 0' }}>—</div>
                )}
                {items.map(item => {
                  const hl = dagHighlight(item);
                  const isSelected = item.id === selectedId;
                  const isSelf = item.id === hoveredId;

                  // Hover DAG colors take full priority — selected shows as ring only.
                  const borderColor =
                    hl === 'needs'   ? '#ef4444' :
                    hl === 'unlocks' ? '#4CCB7F' :
                    isSelf           ? col.color :
                    isSelected       ? '#86C6CA' :
                    `${col.color}35`;

                  const cardBg =
                    hl === 'needs'   ? '#ef444418' :
                    hl === 'unlocks' ? '#4CCB7F24' :
                    isSelf           ? `${col.color}14` :
                    isSelected       ? '#86C6CA14' :
                    'var(--c-surface)';

                  // Selected card gets an extra top border to stay visible under hover colors.
                  const outline = isSelected ? '2px solid #86C6CA66' : 'none';

                  return (
                    <div
                      key={item.id}
                      onClick={e => { e.stopPropagation(); selectRow(item.id); }}
                      onMouseEnter={() => setHoveredId(item.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        borderRadius: 6,
                        border: `1px solid ${borderColor}`,
                        borderLeft: `3px solid ${borderColor}`,
                        outline,
                        background: cardBg,
                        padding: '8px 8px 7px',
                        cursor: 'pointer',
                        transition: 'border-color 120ms, background 120ms, outline 120ms',
                        flexShrink: 0,
                      }}
                    >
                      {/* Status dot + title */}
                      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start', marginBottom: 5 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                          background: STATUS_COLOR[item.status] ?? 'var(--c-gray)',
                        }} />
                        <span style={{
                          fontSize: 11, fontWeight: 600, lineHeight: 1.35, color: 'var(--c-white)',
                        }}>
                          {item.title}
                        </span>
                      </div>

                      {/* Badges row */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 5 }}>
                        <Chip
                          text={item.status === 'Blocked' ? `Blocked ${item.priority}` : item.status}
                          color={STATUS_COLOR[item.status] ?? 'var(--c-gray)'}
                        />
                        <Chip
                          text={item.priority}
                          color={PRIORITY_COLOR[item.priority] ?? 'var(--c-gray)'}
                        />
                        <Chip
                          text={EFFORT_LABEL[item.effort] ?? item.effort}
                          color="var(--c-gray)"
                        />
                        {item.revenue_impact_tier !== 'Unsized' && (
                          <Chip
                            text={item.revenue_impact_tier}
                            color="#4CCB7F"
                          />
                        )}
                        <Chip
                          text={MECH_SHORT[item.mechanic] ?? item.mechanic}
                          color={col.color}
                        />
                      </div>

                      {/* DAG chips */}
                      {item.depends_on.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', marginBottom: 3 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', letterSpacing: '0.05em', flexShrink: 0 }}>
                            NEEDS
                          </span>
                          {item.depends_on.map(d => (
                            <span
                              key={d}
                              title={itemById[d]?.title ?? d}
                              onClick={e => { e.stopPropagation(); selectRow(d); }}
                              style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                                background: '#ef444415', border: '1px solid #ef444430', color: '#ef4444',
                                cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {shortTitle(d, itemById)}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.unlocks.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 8, fontWeight: 700, color: '#4CCB7F', letterSpacing: '0.05em', flexShrink: 0 }}>
                            UNLOCKS
                          </span>
                          {item.unlocks.map(u => (
                            <span
                              key={u}
                              title={itemById[u]?.title ?? u}
                              onClick={e => { e.stopPropagation(); selectRow(u); }}
                              style={{
                                fontSize: 9, padding: '1px 5px', borderRadius: 3,
                                background: '#4CCB7F22', border: '1px solid #4CCB7F44', color: '#4CCB7F',
                                cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {shortTitle(u, itemById)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
