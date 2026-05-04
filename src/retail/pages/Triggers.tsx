// 2-Week Notice Trigger page.
// Section 1: Today's Flag Cascade (LP + Hidden HG partial processors)
// Section 2: Notice — FT Escalation
// Section 3: Tier 3 — Recognition
// Section 4: Bulletproofing — dynamic tier-mapped catalog table

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { EnrichedImprovement, TriggerAssociate } from '../api/client';
import type { View } from '../types';

type Section = 'today' | 'hidden' | 'notice' | 'tier3' | 'bulletproof';

const DEFAULT_OPEN: Record<Section, boolean> = {
  today: true,
  hidden: true,
  notice: true,
  tier3: false,
  bulletproof: false,
};

const SEVERITY_COLORS: Record<string, string> = {
  Immediate: 'var(--c-flag-red)',
  Standard: 'var(--c-flag-yellow)',
};

const TIER_COLORS: Record<string, string> = {
  'Notice': 'var(--c-flag-yellow)',
  'Today': 'var(--c-flag-yellow)',
  'Tier 3': 'var(--c-flag-green)',
};

function pct(v: number | null | undefined) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function dollar(v: number | null | undefined) {
  if (v == null) return '—';
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function SectionToggle({
  id, label, open, onToggle, children,
}: {
  id: Section;
  label: string;
  open: boolean;
  onToggle: (id: Section) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--c-border)', paddingTop: 12, marginBottom: 16 }}>
      <button
        onClick={() => onToggle(id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 600, color: 'var(--c-white)',
          padding: '2px 0', width: '100%', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--c-gray)' }}>{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

function TierNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 8,
      padding: '6px 10px', background: 'var(--c-surface)',
      borderLeft: '3px solid var(--c-border)', borderRadius: 3,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-gray)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--c-white)' }}>{children}</span>
    </div>
  );
}

function ThresholdBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-block', padding: '4px 10px', marginBottom: 10,
      background: 'rgba(245,197,66,0.14)', borderRadius: 4, fontSize: 12, fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

function AssocTable({
  rows,
  showNote = false,
  showCompound = false,
  showSeverity = false,
  showGross = false,
  showFineUnit = false,
  highlightHoursOver100 = false,
  s_hr_threshold = 0.40,
  refund_threshold = 0.20,
}: {
  rows: TriggerAssociate[];
  showNote?: boolean;
  showCompound?: boolean;
  showSeverity?: boolean;
  showGross?: boolean;
  showFineUnit?: boolean;
  highlightHoursOver100?: boolean;
  s_hr_threshold?: number;
  refund_threshold?: number;
}) {
  if (!rows.length) {
    return <p style={{ color: 'var(--c-gray)', fontSize: 13 }}>No associates.</p>;
  }

  const lastCol = showNote ? 'Note' : showCompound ? 'Compound Signals' : 'Trigger';

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr style={{ background: 'var(--c-surface)', color: 'var(--c-gray)' }}>
            {showSeverity && (
              <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>Severity</th>
            )}
            {['ID', 'Store', 'Title', 'Hours', 'Class'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
            {showGross && (
              <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>Gross</th>
            )}
            <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>S/Hr vs Store</th>
            <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>Refund vs Store</th>
            {showCompound && (
              <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>AOV</th>
            )}
            {(showFineUnit || showCompound) && (
              <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>Fine Unit%</th>
            )}
            {showCompound && (
              <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>Net Sales</th>
            )}
            <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{lastCol}</th>
            <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>Escalation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const trigger = r.triggers?.[0];
            const tierColor = trigger ? TIER_COLORS[trigger.tier] ?? 'var(--c-gray)' : 'var(--c-gray)';
            const severityColor = r.severity ? SEVERITY_COLORS[r.severity] ?? 'var(--c-gray)' : undefined;
            const hoursFlag = highlightHoursOver100 && r.hours_over_100;
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                {showSeverity && (
                  <td style={{ padding: '4px 8px', color: severityColor, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                    {r.severity ?? '—'}
                  </td>
                )}
                <td style={{ padding: '4px 8px', color: 'var(--c-gray)' }}>{r.staff_id ?? '—'}</td>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{r.store ?? '—'}</td>
                <td style={{ padding: '4px 8px', color: 'var(--c-gray)', whiteSpace: 'nowrap' }}>{r.title ?? '—'}</td>
                <td style={{
                  padding: '4px 8px', textAlign: 'right',
                  fontWeight: hoursFlag ? 700 : 400,
                  color: hoursFlag ? 'var(--c-flag-red)' : 'inherit',
                }}>
                  {r.hours != null ? r.hours.toFixed(0) : '—'}
                  {hoursFlag ? ' ↑' : ''}
                </td>
                <td style={{ padding: '4px 8px' }}>{r.hours_class}</td>
                {showGross && (
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--c-gray)' }}>
                    {dollar(r.gross_sales)}
                  </td>
                )}
                <td style={{
                  padding: '4px 8px', textAlign: 'center',
                  color: r.s_hr_vs_store != null && r.s_hr_vs_store < s_hr_threshold ? 'var(--c-flag-red)' : 'inherit',
                  fontWeight: r.s_hr_vs_store != null && r.s_hr_vs_store < s_hr_threshold ? 600 : 400,
                }}>
                  {pct(r.s_hr_vs_store)}
                </td>
                <td style={{
                  padding: '4px 8px', textAlign: 'center',
                  color: r.refund_vs_store != null && r.refund_vs_store > refund_threshold ? 'var(--c-flag-red)' : 'inherit',
                  fontWeight: r.refund_vs_store != null && r.refund_vs_store > refund_threshold ? 600 : 400,
                }}>
                  {r.refund_vs_store != null ? `+${pct(r.refund_vs_store)}` : '—'}
                </td>
                {showCompound && (
                  <td style={{
                    padding: '4px 8px', textAlign: 'right',
                    color: r.compound_signals?.includes('AOV') ? 'var(--c-flag-red)' : 'var(--c-gray)',
                    fontWeight: r.compound_signals?.includes('AOV') ? 600 : 400,
                  }}>
                    {dollar(r.aov)}
                  </td>
                )}
                {(showFineUnit || showCompound) && (
                  <td style={{
                    padding: '4px 8px', textAlign: 'center',
                    color: r.compound_signals?.includes('Fine Unit%') ? 'var(--c-flag-red)' : 'var(--c-gray)',
                    fontWeight: r.compound_signals?.includes('Fine Unit%') ? 600 : 400,
                  }}>
                    {pct(r.fine_unit_pct)}
                  </td>
                )}
                {showCompound && (
                  <td style={{
                    padding: '4px 8px', textAlign: 'right',
                    color: r.compound_signals?.includes('Net Sales') ? 'var(--c-flag-red)' : 'var(--c-gray)',
                    fontWeight: r.compound_signals?.includes('Net Sales') ? 600 : 400,
                  }}>
                    {dollar(r.net_sales)}
                  </td>
                )}
                {showNote ? (
                  <td style={{ padding: '4px 8px', color: 'var(--c-gray)', fontSize: 11 }}>{r.note ?? '—'}</td>
                ) : showCompound ? (
                  <td style={{ padding: '4px 8px' }}>
                    {(r.compound_signals ?? []).map((sig, i) => (
                      <span key={sig}>
                        {i > 0 && <span style={{ color: 'var(--c-border)', margin: '0 3px' }}>,</span>}
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-flag-red)' }}>{sig}</span>
                      </span>
                    ))}
                  </td>
                ) : (
                  <td style={{ padding: '4px 8px', color: tierColor, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {trigger?.label ?? '—'}
                  </td>
                )}
                <td style={{ padding: '4px 8px', color: 'var(--c-flag-red)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {trigger?.escalation ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Tier-to-slug mapping for bulletproofing table
const BULLETPROOF_TIER: Record<string, string> = {
  hg_processor_perf_isolation: 'Notice',
  two_week_notice_trending: 'Notice / Tier 3',
  part_time_productivity: 'Notice',
  recognition_program: 'Tier 3',
  sub_monthly_ingest: 'All tiers',
};

const STATUS_COLOR: Record<string, string> = {
  Ready: '#4CCB7F', 'In-Progress': '#86C6CA',
  Blocked: 'var(--c-flag-red)', Backlog: 'var(--c-gray)', Shipped: '#4CCB7F',
};

function BulletproofTable({
  onNavigate,
}: {
  onNavigate: (v: View) => void;
}) {
  const [items, setItems] = useState<EnrichedImprovement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.improvementsAll()
      .then((allData) => {
        const allById: Record<string, EnrichedImprovement> = {};
        for (const it of allData.items) allById[it.id] = it;

        const slugs = [
          'hg_processor_perf_isolation',
          'two_week_notice_trending',
          'part_time_productivity',
          'recognition_program',
          'sub_monthly_ingest',
        ];

        const result: EnrichedImprovement[] = [];
        for (const slug of slugs) {
          const item = allById[slug];
          if (item) result.push(item);
        }
        setItems(result);
      })
      .catch(e => setErr(String(e)));
  }, []);

  if (err) return <p style={{ color: 'var(--c-flag-red)', fontSize: 12 }}>{err}</p>;
  if (!items) return <p style={{ color: 'var(--c-gray)', fontSize: 13 }}>Loading…</p>;
  if (!items.length) return <p style={{ color: 'var(--c-gray)', fontSize: 13 }}>No items found.</p>;

  const headers = ['Tier Affected', 'Action Item', 'Priority', 'Effort', 'Status', 'Blocking', 'What It Enables'];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
        <thead>
          <tr style={{ background: 'var(--c-surface)', color: 'var(--c-gray)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const tierLabel = BULLETPROOF_TIER[item.id] ?? '—';
            const statusColor = STATUS_COLOR[item.status] ?? 'var(--c-gray)';
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                <td style={{ padding: '5px 8px', color: 'var(--c-gray)', whiteSpace: 'nowrap', fontSize: 11 }}>{tierLabel}</td>
                <td style={{ padding: '5px 8px' }}>
                  <button
                    onClick={() => onNavigate({ type: 'triggers', selectedImprovementId: item.id })}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--c-teal)', fontWeight: 600, fontSize: 12,
                      padding: 0, textAlign: 'left', textDecoration: 'underline',
                    }}
                  >
                    {item.title}
                  </button>
                </td>
                <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: item.priority === 'P0' ? 'var(--c-flag-red)' : item.priority === 'P1' ? 'var(--c-flag-yellow)' : 'var(--c-border)',
                    color: item.priority === 'P0' ? '#fff' : item.priority === 'P1' ? 'var(--c-neutral-dark)' : 'var(--c-white)',
                  }}>{item.priority}</span>
                </td>
                <td style={{ padding: '5px 8px', color: 'var(--c-gray)', fontSize: 11 }}>{item.effort}</td>
                <td style={{ padding: '5px 8px', color: statusColor, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{item.status}</td>
                <td style={{ padding: '5px 8px', fontSize: 11 }}>
                  {item.depends_on.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {item.depends_on.map(dep => (
                        <span key={dep} style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 3,
                          background: '#ef444412', border: '1px solid #ef444430', color: '#ef4444',
                        }}>{dep}</span>
                      ))}
                    </div>
                  ) : <span style={{ color: 'var(--c-gray)' }}>—</span>}
                </td>
                <td style={{ padding: '5px 8px', color: 'var(--c-gray)', fontSize: 11 }}>{item.output_value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type TierData = { count: number; rows: TriggerAssociate[] } | null;

export function Triggers({
  onNavigate,
}: {
  view: { type: 'triggers'; selectedImprovementId?: string };
  onNavigate: (v: View) => void;
}) {
  const [todayData, setTodayData] = useState<TierData>(null);
  const [hiddenData, setHiddenData] = useState<TierData>(null);
  const [noticeData, setNoticeData] = useState<TierData>(null);
  const [t4Data, setT4Data] = useState<TierData>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<Section, boolean>>(DEFAULT_OPEN);

  useEffect(() => {
    Promise.all([
      api.triggersToday(),
      api.triggersHidden(),
      api.triggersNotice(),
      api.triggersT4(),
    ])
      .then(([t, h, n, t4]) => {
        setTodayData(t);
        setHiddenData(h);
        setNoticeData(n);
        setT4Data(t4);
      })
      .catch(e => setErr(String(e)));
  }, []);

  function toggle(id: Section) {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (err) return <div style={{ color: 'var(--c-flag-red)', padding: 24 }}>{err}</div>;

  const loading = <p style={{ color: 'var(--c-gray)', fontSize: 13 }}>Loading…</p>;

  const hiddenOver100 = hiddenData?.rows.filter(r => r.hours_over_100).length ?? 0;

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px 0' }}>2-Week Notice Trigger</h1>
        <p style={{ fontSize: 13, color: 'var(--c-gray)', margin: 0 }}>
          Today's cascade output + proposed tier architecture with Jan snapshot candidates.
          Tier 3 requires consecutive-week data — Jan figures are one-week proxies.
        </p>
      </div>

      {/* Section 1A — Today's Cascade */}
      <SectionToggle
        id="today"
        label={`Today's Flag Cascade — ${todayData ? todayData.count : '…'} Low Productivity flagged`}
        open={open.today}
        onToggle={toggle}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {todayData ? todayData.count : '…'} Flagged — Low Productivity
          </div>
          <p style={{ fontSize: 12, color: 'var(--c-gray)', margin: '0 0 6px 0' }}>
            <span style={{ fontFamily: 'monospace', background: 'var(--c-surface)', padding: '1px 6px', borderRadius: 3 }}>
              S/Hr &lt; 60% store avg AND hours_worked &gt; 100
            </span>
          </p>
          {todayData ? <AssocTable rows={todayData.rows} s_hr_threshold={0.60} refund_threshold={0.20} /> : loading}
        </div>
        {/* Weakness bullets */}
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(245,197,66,0.12)', borderLeft: '3px solid #f59e0b',
          borderRadius: '0 4px 4px 0', fontSize: 12,
        }}>
          <div style={{ fontWeight: 700, color: '#F5C542', marginBottom: 6 }}>
            ⚠ Limitation: HG Processor flag fires first in cascade (63 associates excluded).
          </div>
          <div style={{ color: 'var(--c-white)', marginBottom: 4 }}>
            But associates in the +10pp–+20pp refund band may be partial processors:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--c-white)', lineHeight: 1.7 }}>
            <li>HG transaction gross inflates S/Hr denominator — flag may be catching processing load, not selling failure</li>
            <li>S/Hr metric doesn't isolate organic selling time vs HG floor time</li>
            <li>Associates near the +10pp detection boundary are the highest false-flag risk</li>
            <li>Requires tx-level time allocation data to cleanly separate (<code>hg_processor_perf_isolation</code>)</li>
          </ul>
        </div>
      </SectionToggle>

      {/* Section 1B — Hidden Partial HG Processors */}
      <SectionToggle
        id="hidden"
        label={`Hidden — Partial HG Processors Below 60% S/Hr — ${hiddenData ? hiddenData.count : '…'} associates`}
        open={open.hidden}
        onToggle={toggle}
      >
        <p style={{ fontSize: 12, color: 'var(--c-gray)', margin: '0 0 8px 0' }}>
          These associates have HG-inflated gross (both sides of the gift-card cycle) but still fall below 60% store S/Hr —
          a paradox that signals either dual risk (processing load + low organic selling) or a partial processor the flag only barely caught.
          Refund delta 0.10–0.20pp, gross &gt;$5K, S/Hr &lt;60%.
        </p>
        {hiddenOver100 > 0 && (
          <TierNote label={`${hiddenOver100} FT (>100hrs):`}>
            These would trigger Low Productivity if the HG flag were stripped. Hours shown in{' '}
            <span style={{ color: 'var(--c-flag-red)', fontWeight: 600 }}>red</span>.
          </TierNote>
        )}
        {hiddenData ? (
          <AssocTable
            rows={hiddenData.rows}
            showNote
            showGross
            highlightHoursOver100
            s_hr_threshold={0.60}
            refund_threshold={0.10}
          />
        ) : loading}
      </SectionToggle>

      {/* Section 2 — Notice (replaces Tier 1 + Tier 2) */}
      <SectionToggle
        id="notice"
        label={`Notice — FT Escalation — ${noticeData ? noticeData.count : '…'} candidates`}
        open={open.notice}
        onToggle={toggle}
      >
        <ThresholdBox>
          Immediate: S/Hr &lt;40% → RM + VP &nbsp;|&nbsp; Standard: S/Hr 40–60% AND Refund &gt;+20pp → RM
        </ThresholdBox>
        <p style={{ fontSize: 12, color: 'var(--c-gray)', margin: '0 0 8px 0' }}>
          Immediate: &gt;100hrs FT — pure performance failure, no corroboration needed.
          Standard: &gt;64hrs — compound signal, borderline S/Hr with elevated refund rate. S/Hr 40–60% alone is not enough to escalate on a single-month read.
          HG Processors included — inflated gross raises S/Hr, so falling below threshold despite the boost is a stronger signal.
          Jan is a full-month read — no consecutive-week requirement at this stage.
        </p>
        {noticeData ? (
          <AssocTable
            rows={noticeData.rows}
            showSeverity
            showGross
            s_hr_threshold={0.60}
            refund_threshold={0.20}
          />
        ) : loading}
      </SectionToggle>

      {/* Section 3 — Tier 3 */}
      <SectionToggle
        id="tier3"
        label={`Tier 3 — Recognition — ${t4Data ? t4Data.count : '…'} top performers`}
        open={open.tier3}
        onToggle={toggle}
      >
        <ThresholdBox>S/Hr &gt;150% Store RLH for 2 weeks OR top quartile on 3+ metrics for 2 weeks → Recognition</ThresholdBox>
        <TierNote label="Today:">
          {t4Data ? t4Data.count : '…'} Top Performers surfaced from Jan snapshot at S/Hr ≥150% store RLH.
          Recognition should confirm over 3 consecutive weeks once sub_monthly_ingest is live — Jan read surfaces current candidates only.
        </TierNote>
        {t4Data ? (
          <AssocTable rows={t4Data.rows} showFineUnit s_hr_threshold={1.50} refund_threshold={0.20} />
        ) : loading}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <div style={{ padding: 10, background: 'var(--c-surface)', borderRadius: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>What we can do today</div>
            <p style={{ fontSize: 12, color: 'var(--c-gray)', margin: 0 }}>
              Surface top performers by S/Hr threshold. Define top quartile on S/Hr, AOV, Net Sales,
              Fine Unit% — all computable from current snapshot. {t4Data ? t4Data.count : '…'} already identified.
            </p>
          </div>
          <div style={{ padding: 10, background: 'var(--c-surface)', borderRadius: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>What we need</div>
            <p style={{ fontSize: 12, color: 'var(--c-gray)', margin: 0 }}>
              3-week confirmation window for consecutive recognition. Automated RM alert.
              Agreement on which metrics count toward the 3+ threshold.
            </p>
          </div>
        </div>
      </SectionToggle>

      {/* Section 4 — Ontology Improvements */}
      <SectionToggle id="bulletproof" label="Ontology Improvements" open={open.bulletproof} onToggle={toggle}>
        <p style={{ fontSize: 12, color: 'var(--c-gray)', marginBottom: 8 }}>
          Catalog items that close the gaps in this trigger system. Click any row to see full details in the right panel.
        </p>
        <BulletproofTable onNavigate={onNavigate} />
      </SectionToggle>
    </div>
  );
}
