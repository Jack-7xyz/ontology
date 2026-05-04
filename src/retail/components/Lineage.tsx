// Lineage view — 4-column DAG: Source → Plus (staging, 1:1) → BI Dashboard → Mechanics.
// Click any node to highlight its full upstream + downstream path AND surface node-specific
// context in the RightPanel (selection is lifted via `selected` / `onSelectNode`).
//
// BI + Mechanics graph metadata lives in `lineage/graph.ts` so the RightPanel can read it.

import { useEffect, useMemo, useState } from 'react';
import { api, type PlusInfo, type SnapshotInfo } from '../api/client';
import type { View } from '../types';
import { BI_DASHBOARDS, MECHANICS, type LineageLayer, type LineageNodeRef } from '../lineage/graph';

interface Props {
  onNavigate: (v: View) => void;
  selected: LineageNodeRef | null;
  onSelectNode: (n: LineageNodeRef | null) => void;
}

// Tier x positions (canvas columns). Source on left, Mechanics on right.
const COLS = { source: 40, plus: 280, bi: 540, mech: 800 } as const;
const NODE_W = 180;
const NODE_H = 32;
const ROW_H = 38;
const TOP_PAD = 50;

type Layer = LineageLayer;

interface Node {
  layer: Layer;
  id: string;
  label: string;
  x: number;
  y: number;
}

export function Lineage({ onNavigate, selected, onSelectNode }: Props) {
  const [snap, setSnap] = useState<SnapshotInfo | null>(null);
  const [plus, setPlus] = useState<PlusInfo | null>(null);

  useEffect(() => {
    api.snapshotInfo().then(setSnap).catch(() => {});
    api.plusInfo().then(setPlus).catch(() => {});
  }, []);

  // Build node list (positioned). Plus rows align 1:1 with Source by index — the spec is 1:1.
  const { nodes, edges } = useMemo(() => {
    if (!snap || !plus) return { nodes: [] as Node[], edges: [] as [Node, Node][] };

    // Drive source order from plus order so 1:1 mappings render as horizontal lines.
    // (snap.tables comes back alphabetised from sqlite_master — re-order by Plus iteration.)
    const plusIds = plus.tables;
    const sourceTables: string[] = [];
    const seen = new Set<string>();
    plusIds.forEach((pid) => {
      const src = plus.meta[pid].source_table;
      sourceTables.push(src);
      seen.add(src);
    });
    // Append any source not referenced by a Plus tab (defensive — shouldn't happen with current data).
    snap.tables.forEach((t) => {
      if (!seen.has(t)) sourceTables.push(t);
    });
    const plusIdsBySource: Record<string, string> = {};
    plusIds.forEach((pid) => {
      plusIdsBySource[plus.meta[pid].source_table] = pid;
    });

    const ns: Node[] = [];
    sourceTables.forEach((t, i) => {
      ns.push({
        layer: 'source',
        id: t,
        label: t,
        x: COLS.source,
        y: TOP_PAD + i * ROW_H,
      });
    });
    plusIds.forEach((pid, i) => {
      ns.push({
        layer: 'plus',
        id: pid,
        label: plus.meta[pid].label,
        x: COLS.plus,
        y: TOP_PAD + i * ROW_H,
      });
    });
    BI_DASHBOARDS.forEach((b, i) => {
      ns.push({
        layer: 'bi',
        id: b.id,
        label: b.label,
        x: COLS.bi,
        y: TOP_PAD + i * ROW_H,
      });
    });
    MECHANICS.forEach((m, i) => {
      ns.push({
        layer: 'mech',
        id: m.id,
        label: m.label,
        x: COLS.mech,
        y: TOP_PAD + i * ROW_H,
      });
    });

    const find = (layer: Layer, id: string) => ns.find((n) => n.layer === layer && n.id === id);

    const es: [Node, Node][] = [];
    // Source → Plus (1:1, by source_table)
    sourceTables.forEach((t) => {
      const pid = plusIdsBySource[t];
      if (!pid) return;
      const a = find('source', t);
      const b = find('plus', pid);
      if (a && b) es.push([a, b]);
    });
    // Plus → BI
    BI_DASHBOARDS.forEach((b) => {
      b.plus.forEach((pid) => {
        const a = find('plus', pid);
        const z = find('bi', b.id);
        if (a && z) es.push([a, z]);
      });
    });
    // BI → Mechanics
    MECHANICS.forEach((m) => {
      m.bi.forEach((bid) => {
        const a = find('bi', bid);
        const z = find('mech', m.id);
        if (a && z) es.push([a, z]);
      });
    });

    return { nodes: ns, edges: es };
  }, [snap, plus]);

  // Compute the highlighted set (clicked node + all upstream + all downstream).
  const litSet = useMemo(() => {
    if (!selected) return new Set<string>();
    const key = (n: { layer: Layer; id: string }) => `${n.layer}:${n.id}`;
    const lit = new Set<string>([key(selected)]);

    // BFS downstream
    let frontier = [key(selected)];
    while (frontier.length) {
      const next: string[] = [];
      for (const k of frontier) {
        for (const [a, b] of edges) {
          if (key(a) === k && !lit.has(key(b))) {
            lit.add(key(b));
            next.push(key(b));
          }
        }
      }
      frontier = next;
    }
    // BFS upstream
    frontier = [key(selected)];
    while (frontier.length) {
      const next: string[] = [];
      for (const k of frontier) {
        for (const [a, b] of edges) {
          if (key(b) === k && !lit.has(key(a))) {
            lit.add(key(a));
            next.push(key(a));
          }
        }
      }
      frontier = next;
    }
    return lit;
  }, [selected, edges]);

  const totalRows = Math.max(
    snap?.tables.length ?? 0,
    plus?.tables.length ?? 0,
    BI_DASHBOARDS.length,
    MECHANICS.length,
  );
  const W = COLS.mech + NODE_W + 40;
  const H = TOP_PAD + totalRows * ROW_H + 40;

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--c-panel)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex',
          gap: 14,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontSize: 13 }}>Data Lineage</strong>
        <span style={{ fontSize: 12, color: 'var(--c-gray)' }}>
          Source → Plus (staging, 1:1) → BI Dashboards → Mechanics
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-gray)' }}>
          {selected
            ? `Tracing path through ${selected.layer}:${selected.id}`
            : 'Click any node to highlight its upstream + downstream path · double-click Source/Plus/BI to open viewer'}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {/* Column headers */}
          <ColHeader x={COLS.source} label="SOURCE" sub="raw xlsx" color="var(--c-tier-source)" />
          <ColHeader x={COLS.plus}   label="PLUS"   sub="staging · 1:1" color="var(--c-tier-plus)" />
          <ColHeader x={COLS.bi}     label="BI"     sub="dashboards" color="var(--c-tier-bi)" />
          <ColHeader x={COLS.mech}   label="MECHANICS" sub="alerts (stubs)" color="var(--c-tier-mechanics)" />

          {/* Edges (rendered first so nodes paint over) */}
          {edges.map(([a, b], i) => {
            const k1 = `${a.layer}:${a.id}`;
            const k2 = `${b.layer}:${b.id}`;
            const lit = litSet.has(k1) && litSet.has(k2);
            const dim = selected && !lit;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={`e-${i}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                stroke={lit ? 'var(--c-purple)' : '#C8C8D0'}
                strokeWidth={lit ? 2 : 1}
                opacity={dim ? 0.25 : lit ? 0.95 : 0.55}
                fill="none"
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const k = `${n.layer}:${n.id}`;
            const lit = litSet.has(k);
            const dim = selected && !lit;
            const isSel = selected?.layer === n.layer && selected?.id === n.id;
            const fill = nodeFill(n.layer, lit, isSel);
            const stroke = nodeStroke(n.layer, lit, isSel);
            const text = lit || !selected ? 'var(--c-white)' : 'var(--c-gray)';
            // Mech nodes become interactive once the corresponding backend
            // mechanic ships (Phase 1+ for red_count, Phases 2-6 for the rest).
            const mechShipped = n.layer === 'mech' && n.id === 'red_count';
            const isInteractive =
              n.layer === 'source' || n.layer === 'plus' || n.layer === 'bi' || mechShipped;
            return (
              <g
                key={k}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ cursor: 'pointer', opacity: dim ? 0.5 : 1 }}
                onClick={() => onSelectNode(isSel ? null : { layer: n.layer, id: n.id })}
                onDoubleClick={() => {
                  if (n.layer === 'source') onNavigate({ type: 'source', table: n.id });
                  else if (n.layer === 'plus') onNavigate({ type: 'plus', table: n.id });
                  else if (n.layer === 'bi') onNavigate({ type: 'bi', id: n.id });
                  else if (mechShipped) onNavigate({ type: 'mech', id: n.id });
                }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={5}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isSel ? 2 : 1}
                />
                <text
                  x={10}
                  y={NODE_H / 2 + 4}
                  fill={text}
                  fontSize={12}
                  fontWeight={lit ? 600 : 500}
                >
                  {n.label}
                </text>
                {n.layer === 'mech' && !mechShipped && (
                  <text x={NODE_W - 8} y={12} fill="var(--c-gray)" fontSize={9} textAnchor="end">
                    stub
                  </text>
                )}
                {!isInteractive && (
                  <text x={NODE_W - 8} y={NODE_H - 4} fill="var(--c-gray)" fontSize={8} textAnchor="end">
                    Phase 6+
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ColHeader({ x, label, sub, color }: { x: number; label: string; sub: string; color: string }) {
  return (
    <g transform={`translate(${x}, 0)`}>
      <rect width={NODE_W} height={6} fill={color} rx={2} />
      <text x={0} y={22} fontSize={11} fontWeight={700} fill="var(--c-white)" letterSpacing={0.5}>
        {label}
      </text>
      <text x={0} y={36} fontSize={10} fill="var(--c-gray)">
        {sub}
      </text>
    </g>
  );
}

function nodeFill(layer: Layer, lit: boolean, sel: boolean): string {
  if (sel) {
    if (layer === 'source') return 'var(--c-tier-source)';
    if (layer === 'plus') return 'var(--c-tier-plus)';
    if (layer === 'bi') return 'var(--c-tier-bi)';
    return 'var(--c-tier-mechanics)';
  }
  if (lit) {
    if (layer === 'source') return '#17456A';
    if (layer === 'plus') return 'var(--c-tier-tab-derived)';
    if (layer === 'bi') return 'var(--c-tier-bi-derived)';
    return '#286C73';
  }
  if (layer === 'source') return '#102F49';
  if (layer === 'plus') return '#133B5B';
  if (layer === 'bi') return '#174E54';
  return '#1D5F64';
}

function nodeStroke(layer: Layer, lit: boolean, sel: boolean): string {
  if (sel || lit) {
    if (layer === 'source') return 'var(--c-tier-source)';
    if (layer === 'plus') return 'var(--c-purple)';
    if (layer === 'bi') return 'var(--c-tier-bi)';
    return 'var(--c-tier-mechanics)';
  }
  return 'var(--c-border)';
}
