// MechanicPage — first-class page per mechanic. Header (label + deck hook),
// upstream-BI chip row, diagram (kind-dispatched), and 6 collapsible content
// sections: Utility · Logic Overview · Key Insights · Algorithms & Reasoning ·
// Ontology Improvements · Weaknesses / v2 Opportunity.
//
// Section pattern mirrors RightPanel.tsx BiHelper (lines 809-1024) — same
// collapsible affordance, same default-open semantics. Header pattern mirrors
// BiTable.tsx so navigation between BI tables and mechanic pages feels
// continuous.

import { useEffect, useMemo, useState } from 'react';
import { api, type EnrichedImprovement } from '../api/client';
import { BI_BY_ID, MECH_BY_ID } from '../lineage/graph';
import type { MechanicResponse, View } from '../types';
import { Grid8Domain } from './mechanic-diagrams/Grid8Domain';
import { Waterfall } from './mechanic-diagrams/Waterfall';
import { CascadeFlowchart, type CascadeBucket } from './mechanic-diagrams/CascadeFlowchart';
import { StoreRelativeScatter } from './mechanic-diagrams/StoreRelativeScatter';
import { Quadrant2D } from './mechanic-diagrams/Quadrant2D';

interface Props {
  id: string;
  onNavigate: (v: View) => void;
}

type Section =
  | 'utility'
  | 'logic'
  | 'insights'
  | 'algorithms'
  | 'improvements'
  | 'weaknesses';

// Algorithms open by default — that's the threshold table the VP scans first.
// Everything else collapsed for a quieter landing.
const DEFAULT_OPEN: Record<Section, boolean> = {
  utility: false,
  logic: false,
  insights: false,
  algorithms: true,
  improvements: true,
  weaknesses: false,
};

export function MechanicPage({ id, onNavigate }: Props) {
  const [data, setData] = useState<MechanicResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<Section, boolean>>(DEFAULT_OPEN);
  const [allItems, setAllItems] = useState<EnrichedImprovement[]>([]);

  useEffect(() => {
    setData(null);
    setErr(null);
    setOpen(DEFAULT_OPEN);
    api.mechanicRows(id).then(setData).catch((e) => setErr(String(e)));
    api.improvementsAll().then(d => setAllItems(d.items)).catch(() => {});
  }, [id]);

  const itemById = useMemo(() => {
    const m: Record<string, EnrichedImprovement> = {};
    for (const it of allItems) m[it.id] = it;
    return m;
  }, [allItems]);

  if (err) return <div style={{ color: 'var(--c-flag-red)' }}>{err}</div>;
  if (!data) return <div style={{ color: 'var(--c-gray)' }}>loading {id}…</div>;

  const { meta } = data;
  const mech = MECH_BY_ID[id];
  const keyInsights = meta.key_insights ?? [];
  const algorithms = meta.algorithms ?? [];
  const improvements = meta.ontology_improvements ?? [];
  const contributingBiIds = meta.contributing_bi_ids ?? [];
  const weaknesses = meta.weaknesses ?? [];

  function toggle(s: Section) {
    setOpen((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: 'var(--c-tier-mechanics, #C9C2F0)',
              border: '1px solid #9F94E0',
              borderRadius: 2,
            }}
          />
          <h1 style={{ margin: 0, fontSize: 22 }}>{meta.label}</h1>
          <span style={{ color: 'var(--c-gray)', fontSize: 12 }}>
            Mechanic · {mech?.phase ?? ''}
          </span>
        </div>
        <div
          style={{
            marginTop: 6,
            color: 'var(--c-white)',
            fontSize: 14,
            fontStyle: 'italic',
            lineHeight: 1.45,
            maxWidth: 900,
          }}
        >
          {meta.deck_hook}
        </div>
      </div>

      {/* Upstream BI chips — clickable, navigate to the BI table */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--c-gray)', fontWeight: 700, letterSpacing: 0.4 }}>
          UPSTREAM BI
        </span>
        {meta.upstream_bi.map((bid) => (
          <button
            key={bid}
            onClick={() => onNavigate({ type: 'bi', id: bid })}
            style={{
              fontSize: 11,
              padding: '3px 10px',
              background: 'var(--c-tier-bi-derived)',
              borderRadius: 12,
              border: '1px solid #9FD9C2',
              cursor: 'pointer',
              color: 'var(--c-teal)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            }}
            title={`Open ${BI_BY_ID[bid]?.label ?? bid}`}
          >
            {BI_BY_ID[bid]?.label ?? bid}
          </button>
        ))}
      </div>

      {/* Diagram */}
      <DiagramPanel data={data} onNavigate={onNavigate} />

      {/* Collapsible sections */}
      <Section label="Utility" open={open.utility} onToggle={() => toggle('utility')}>
        <Body>{meta.utility}</Body>
      </Section>

      <Section label="Logic Overview" open={open.logic} onToggle={() => toggle('logic')}>
        <Body>{meta.logic_overview}</Body>
      </Section>

      <Section
        label={`Key Insights (${keyInsights.length})`}
        open={open.insights}
        onToggle={() => toggle('insights')}
      >
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
          {keyInsights.map((s, i) => (
            <li key={i} style={{ marginBottom: 6 }}>{s}</li>
          ))}
        </ul>
      </Section>

      <Section
        label={`Algorithms & Reasoning (${algorithms.length})`}
        open={open.algorithms}
        onToggle={() => toggle('algorithms')}
      >
        <AlgorithmsTable rows={algorithms} />
      </Section>

      <Section
        label={`Ontology Improvements (${improvements.length})`}
        open={open.improvements}
        onToggle={() => toggle('improvements')}
      >
        {contributingBiIds.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--c-gray)' }}>surfaces in:</span>
            {contributingBiIds.map((bid) => (
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
        {improvements.length === 0 ? (
          <Body muted>No catalog items for this mechanic yet.</Body>
        ) : (
          <ImprovementsList
            items={improvements}
            itemById={itemById}
            mechId={id}
            onNavigate={onNavigate}
          />
        )}
      </Section>

      <Section
        label={`Weaknesses & v2 Opportunity (${weaknesses.length})`}
        open={open.weaknesses}
        onToggle={() => toggle('weaknesses')}
      >
        <WeaknessesList rows={weaknesses} />
      </Section>


      <div style={{ fontSize: 10, color: 'var(--c-gray)', fontStyle: 'italic', lineHeight: 1.4 }}>
        {meta.source_notes}
      </div>
    </div>
  );
}

// ---- Diagram dispatch ----

function DiagramPanel({ data, onNavigate }: { data: MechanicResponse; onNavigate: (v: View) => void }) {
  const kind = data.meta.diagram.kind;
  if (kind === 'grid_8_domain') {
    const columns = (data.meta.diagram.spec.columns as string[] | undefined) ?? [];
    const click = data.meta.diagram.spec.click_through;
    if (!click || !click.anchor_field) return null;
    return (
      <Grid8Domain
        rows={(data.rows ?? []) as unknown as Parameters<typeof Grid8Domain>[0]['rows']}
        columns={columns}
        distribution={data.distribution ?? {}}
        clickThrough={{
          target_view: click.target_view,
          target_id: click.target_id,
          anchor_field: click.anchor_field,
        }}
        onNavigate={onNavigate}
      />
    );
  }
  if (kind === 'waterfall') {
    const click = data.meta.diagram.spec.click_through;
    if (!click || !click.anchor_field) return null;
    const fleet = data.fleet as Parameters<typeof Waterfall>[0]['fleet'] | undefined;
    const hgRiskDistribution =
      (data.hg_risk_distribution as Record<string, number> | undefined) ?? {};
    if (!fleet) return null;
    return (
      <Waterfall
        rows={(data.rows ?? []) as unknown as Parameters<typeof Waterfall>[0]['rows']}
        fleet={fleet}
        hgRiskDistribution={hgRiskDistribution}
        clickThrough={{
          target_view: click.target_view,
          target_id: click.target_id,
          anchor_field: click.anchor_field,
        }}
        onNavigate={onNavigate}
      />
    );
  }
  if (kind === 'cascade_flowchart') {
    const click = data.meta.diagram.spec.click_through;
    if (!click || !click.filter_field) return null;
    const buckets = (data.buckets as CascadeBucket[] | undefined) ?? [];
    const sourceLabel =
      (data.meta.diagram.spec.source_label as string | undefined) ?? '';
    // Fleet summary strip — shape varies per mechanic (stores+gap$ for
    // attr_gap; associates+bucket-counts for perf_flag_cascade). Build
    // conditionally off whatever fields are present.
    const fleet = data.fleet as
      | {
          // attr_gap fields
          total_stores?: number;
          total_flagged?: number;
          gap_total_d?: number;
          gap_pct_weighted?: number;
          // perf_flag_cascade fields
          total_associates?: number;
          hg_processor_count?: number;
          low_productivity_count?: number;
          high_refunds_count?: number;
          top_performer_count?: number;
        }
      | undefined;
    const summary = fleet
      ? (() => {
          const total = fleet.total_stores ?? fleet.total_associates;
          const items: {
            label: string;
            value: string;
            tone: 'neutral' | 'accent';
          }[] = [];
          if (total !== undefined && fleet.total_flagged !== undefined) {
            items.push({
              label: 'flagged',
              value: `${fleet.total_flagged} / ${total}`,
              tone: 'accent',
            });
          }
          // attr_gap specifics
          if (fleet.gap_total_d !== undefined) {
            items.push({
              label: 'total gap $',
              value: fmtMoneyCompact(fleet.gap_total_d),
              tone: 'neutral',
            });
          }
          if (
            fleet.gap_pct_weighted !== undefined &&
            fleet.gap_pct_weighted !== null
          ) {
            items.push({
              label: '$-weighted gap %',
              value: `${(fleet.gap_pct_weighted * 100).toFixed(1)}%`,
              tone: 'neutral',
            });
          }
          // perf_flag_cascade specifics — the 3 red/yellow priority buckets
          // most material to the VP's action list.
          if (fleet.hg_processor_count !== undefined) {
            items.push({
              label: 'HG Processors',
              value: String(fleet.hg_processor_count),
              tone: 'neutral',
            });
          }
          if (fleet.low_productivity_count !== undefined) {
            items.push({
              label: 'Low Productivity',
              value: String(fleet.low_productivity_count),
              tone: 'neutral',
            });
          }
          if (fleet.top_performer_count !== undefined) {
            items.push({
              label: 'Top Performers',
              value: String(fleet.top_performer_count),
              tone: 'neutral',
            });
          }
          return items;
        })()
      : undefined;
    return (
      <CascadeFlowchart
        buckets={buckets}
        source_label={sourceLabel}
        clickThrough={{
          target_view: click.target_view,
          target_id: click.target_id,
          filter_field: click.filter_field,
        }}
        onNavigate={onNavigate}
        summary={summary}
      />
    );
  }
  if (kind === 'store_relative_scatter') {
    const click = data.meta.diagram.spec.click_through;
    if (!click || !click.anchor_field) return null;
    const fleet = data.fleet as Parameters<typeof StoreRelativeScatter>[0]['fleet'] | undefined;
    const thresholds = data.thresholds as Parameters<typeof StoreRelativeScatter>[0]['thresholds'] | undefined;
    if (!fleet || !thresholds) return null;
    return (
      <StoreRelativeScatter
        rows={(data.rows ?? []) as unknown as Parameters<typeof StoreRelativeScatter>[0]['rows']}
        fleet={fleet}
        thresholds={thresholds}
        bins={(data.bins ?? []) as Parameters<typeof StoreRelativeScatter>[0]['bins']}
        clickThrough={{
          target_view: click.target_view,
          target_id: click.target_id,
          anchor_field: click.anchor_field,
        }}
        onNavigate={onNavigate}
      />
    );
  }
  if (kind === 'quadrant_2d') {
    const click = data.meta.diagram.spec.click_through;
    if (!click || !click.anchor_field) return null;
    const fleet = data.fleet as Parameters<typeof Quadrant2D>[0]['fleet'] | undefined;
    const thresholds = data.thresholds as Parameters<typeof Quadrant2D>[0]['thresholds'] | undefined;
    const zones = (data.zones as Parameters<typeof Quadrant2D>[0]['zones'] | undefined) ?? [];
    if (!fleet || !thresholds) return null;
    return (
      <Quadrant2D
        rows={(data.rows ?? []) as unknown as Parameters<typeof Quadrant2D>[0]['rows']}
        zones={zones}
        fleet={fleet}
        thresholds={thresholds}
        clickThrough={{
          target_view: click.target_view,
          target_id: click.target_id,
          anchor_field: click.anchor_field,
        }}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <div
      style={{
        padding: 16,
        border: '1px dashed var(--c-border)',
        borderRadius: 6,
        color: 'var(--c-gray)',
        fontSize: 12,
        fontStyle: 'italic',
      }}
    >
      Diagram kind <code>{kind}</code> not yet implemented.
    </div>
  );
}

// ---- Sub-components ----

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
    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 8 }}>
      <button
        onClick={onToggle}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3,
          color: 'var(--c-white)',
          width: '100%',
          padding: '4px 0',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            color: 'var(--c-gray)',
            fontSize: 11,
          }}
        >
          ▶
        </span>
        {label}
      </button>
      {open && <div style={{ paddingTop: 8 }}>{children}</div>}
    </div>
  );
}

function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.5,
        color: muted ? 'var(--c-gray)' : 'var(--c-white)',
        maxWidth: 900,
      }}
    >
      {children}
    </div>
  );
}

function AlgorithmsTable({
  rows,
}: {
  rows: { domain: string; metric: string; green: string; yellow: string; red: string; reasoning: string }[];
}) {
  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--c-border)', borderRadius: 6 }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr style={{ background: 'var(--c-tier-bi-derived)' }}>
            <th style={TH}>Domain</th>
            <th style={TH}>Metric</th>
            <th style={{ ...TH, textAlign: 'center', width: 80 }}>G</th>
            <th style={{ ...TH, textAlign: 'center', width: 80 }}>Y</th>
            <th style={{ ...TH, textAlign: 'center', width: 80 }}>R</th>
            <th style={TH}>Reasoning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain} style={{ borderBottom: '1px solid var(--c-border)' }}>
              <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.domain}</td>
              <td style={{ ...TD, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 11, color: 'var(--c-teal)' }}>
                {r.metric}
              </td>
              <td style={{ ...TD, textAlign: 'center', background: 'rgba(46,189,133,0.10)' }}>{r.green}</td>
              <td style={{ ...TD, textAlign: 'center', background: 'rgba(245,200,66,0.15)' }}>{r.yellow}</td>
              <td style={{ ...TD, textAlign: 'center', background: 'rgba(220,86,86,0.12)' }}>{r.red}</td>
              <td style={{ ...TD, color: 'var(--c-gray)', fontStyle: 'italic' }}>{r.reasoning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeaknessesList({ rows }: { rows: { rule: string; v2_fix: string }[] }) {
  return (
    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>
      {rows.map((w, i) => (
        <li key={i} style={{ marginBottom: 8 }}>
          <div style={{ color: 'var(--c-white)' }}>{w.rule}</div>
          <div
            style={{
              marginTop: 2,
              padding: '4px 8px',
              background: 'rgba(23,69,106,0.32)',
              borderLeft: '3px solid var(--c-purple)',
              borderRadius: 3,
              fontSize: 12,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: 'var(--c-teal)' }}>
              v2:
            </span>{' '}
            {w.v2_fix}
          </div>
        </li>
      ))}
    </ol>
  );
}

const CAP_GROUP_LABEL: Record<string, string> = {
  ingest_foundation: 'Platform Foundation',
  diagnostic_chain:  'Diagnostic Upgrade',
  terminal_action:   'Terminal Action',
  operational_win:   'Operational Win',
};
const CAP_GROUP_COLOR: Record<string, string> = {
  ingest_foundation: '#8EA2FF',
  diagnostic_chain:  '#38BDF8',
  terminal_action:   '#4CCB7F',
  operational_win:   '#B18CFF',
};
const STATUS_COLOR: Record<string, string> = {
  Ready:         '#4CCB7F',
  'In-Progress': '#86C6CA',
  Blocked:       'var(--c-flag-red)',
  Backlog:       'var(--c-gray)',
  Shipped:       '#4CCB7F',
};
const EFFORT_LABEL: Record<string, string> = { S: 'Config', M: 'Pipeline', L: 'Platform' };

function tint(color: string, pct = 16): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function shortDepTitle(id: string, itemById: Record<string, EnrichedImprovement>, maxLen = 22): string {
  const title = itemById[id]?.title;
  if (!title) return id;
  if (title.length <= maxLen) return title;
  const cut = title.slice(0, maxLen);
  const sp = cut.lastIndexOf(' ');
  return (sp > 8 ? cut.slice(0, sp) : cut) + '…';
}

function ImprovementsList({
  items,
  itemById,
  mechId,
  onNavigate,
}: {
  items: import('../types').OntologyImprovement[];
  itemById: Record<string, EnrichedImprovement>;
  mechId: string;
  onNavigate: (v: View) => void;
}) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12 }}>
      {items.map((it) => {
        const enriched = itemById[it.id];
        const status = enriched?.status;
        const revTier = enriched?.revenue_impact_tier;
        const capColor = CAP_GROUP_COLOR[it.capability_group] ?? 'var(--c-gray)';
        const statusColor = status ? (STATUS_COLOR[status] ?? 'var(--c-gray)') : null;

        return (
          <li
            key={it.id}
            onClick={() => onNavigate({ type: 'mech', id: mechId, selectedImprovementId: it.id })}
            style={{
              padding: '9px 11px',
              marginBottom: 7,
              borderLeft: `3px solid ${capColor}`,
              background: `${capColor}08`,
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'background 120ms',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${capColor}18`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${capColor}08`)}
          >
            {/* Row 1: status indicator + title */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 6 }}>
              {statusColor && (
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                  background: statusColor,
                }} />
              )}
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: 'var(--c-white)', flex: 1 }}>
                {it.title}
              </span>
              <span style={{ fontSize: 9, color: 'var(--c-gray)', flexShrink: 0, marginTop: 2 }}>click for detail →</span>
            </div>

            {/* Row 2: property chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: it.depends_on.length > 0 || it.unlocks.length > 0 ? 6 : 0 }}>
              {status && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  color: statusColor!, border: `1px solid ${tint(statusColor!, 48)}`,
                  background: tint(statusColor!, 16),
                }}>
                  {status}
                </span>
              )}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                background: priorityBg(it.priority), color: priorityFg(it.priority),
              }}>
                {it.priority}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                background: 'var(--c-border)', color: 'var(--c-white)',
              }}>
                {EFFORT_LABEL[it.effort] ?? it.effort}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                color: capColor, border: `1px solid ${tint(capColor, 48)}`, background: tint(capColor, 16),
              }}>
                {CAP_GROUP_LABEL[it.capability_group] ?? it.capability_group}
              </span>
              {revTier && revTier !== 'Unsized' && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                  background: 'var(--c-tier-tab-derived)', color: 'var(--c-teal)',
                }}>
                  {revTier}
                </span>
              )}
            </div>

            {/* Row 3: NEEDS / UNLOCKS with human titles */}
            {it.depends_on.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: it.unlocks.length > 0 ? 4 : 0 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', letterSpacing: '0.05em', flexShrink: 0 }}>NEEDS</span>
                {it.depends_on.map(d => (
                  <span key={d} title={itemById[d]?.title ?? d} style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: '#ef444415', border: '1px solid #ef444430', color: '#ef4444',
                  }}>
                    {shortDepTitle(d, itemById)}
                  </span>
                ))}
              </div>
            )}
            {it.unlocks.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: '#4CCB7F', letterSpacing: '0.05em', flexShrink: 0 }}>UNLOCKS</span>
                {it.unlocks.map(u => (
                  <span key={u} title={itemById[u]?.title ?? u} style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: '#4CCB7F22', border: '1px solid #4CCB7F44', color: '#4CCB7F',
                  }}>
                    {shortDepTitle(u, itemById)}
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}


function priorityBg(p: 'P0' | 'P1' | 'P2'): string {
  return p === 'P0' ? 'var(--c-flag-red)' : p === 'P1' ? 'var(--c-flag-yellow)' : 'var(--c-border)';
}

function priorityFg(p: 'P0' | 'P1' | 'P2'): string {
  return p === 'P1' ? 'var(--c-neutral-dark)' : 'var(--c-white)';
}


const TH: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  borderBottom: '2px solid var(--c-border)',
  fontWeight: 600,
};

const TD: React.CSSProperties = {
  padding: '6px 10px',
  verticalAlign: 'top',
};

// Compact $ formatter used by the CascadeFlowchart summary strip (same shape
// as Waterfall.fmtMoney compact branch — avoid import cycle by duplicating).
function fmtMoneyCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}
