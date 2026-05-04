// Waterfall — Revenue Decomposition diagram (mechanic #2).
//
// Fleet aggregate summary at top: Gross → Deduped Gross → Net → Ontology Net
// across all stores, with the Est GC Revenue deduction called out between
// Gross and Deduped (and between Net and Ontology Net). Numbers must match the
// deck's fleet waterfall exactly.
//
// Per-store rows sorted by gross desc: each row is a compact 4-stage mini
// waterfall + a flag strip (Recycle · GC/Gross · HG Risk · Inv Risk). Click
// any row → navigate to HG Intelligence anchored on that store.
//
// The GC recycling callout is the visual delta between Gross and Deduped —
// rendered as a red dashed bracket so the inflation amount is never hidden
// inside a single bar.
//
// Visual idiom mirrors Grid8Domain: sticky header, row-level hover, same
// flag colors via CSS vars.
import type { FlagColor, View } from '../../types';

interface WaterfallRow {
  store: string;
  gross: number | null;
  est_gc_revenue: number | null;
  deduped: number | null;
  net: number | null;
  ontology_net: number | null;
  recycle_rate: number | null;
  gc_gross_pct: number | null;
  missing_rate: number | null;
  hg_risk_score: number | null;
  inv_risk_flag: string;
  recycle_flag: FlagColor | null;
  gc_gross_flag: FlagColor | null;
  missing_flag: FlagColor | null;
  hg_risk_flag: FlagColor | null;
  inv_risk_cell_flag: FlagColor | null;
}

interface FleetAggregate {
  gross: number;
  est_gc_revenue: number;
  deduped: number;
  net: number;
  ontology_net: number;
  recycle_median: number | null;
  stores: number;
}

interface Props {
  rows: WaterfallRow[];
  fleet: FleetAggregate;
  hgRiskDistribution: Record<string, number>;
  clickThrough: { target_view: 'bi'; target_id: string; anchor_field: string };
  onNavigate: (v: View) => void;
}

const FLAG_COLOR: Record<FlagColor, string> = {
  green: 'var(--c-flag-green)',
  yellow: 'var(--c-flag-yellow)',
  red: 'var(--c-flag-red)',
};

function tint(color: string, pct = 18): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

function fmtMoney(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined) return '—';
  if (compact) {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${Math.round(v / 1_000)}K`;
    return `$${Math.round(v)}`;
  }
  return v.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export function Waterfall({ rows, fleet, hgRiskDistribution, clickThrough, onNavigate }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Fleet aggregate summary — matches deck s_m2_insights bullet 1 */}
      <FleetSummary fleet={fleet} hgRiskDistribution={hgRiskDistribution} />

      {/* Per-store rows */}
      <div
        style={{
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          borderRadius: 6,
          overflow: 'auto',
          maxHeight: 520,
        }}
      >
        <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--c-tier-bi-derived)', zIndex: 1 }}>
            <tr>
              <th style={{ ...TH, position: 'sticky', left: 0, background: 'var(--c-tier-bi-derived)', zIndex: 2, minWidth: 180 }}>
                Store
              </th>
              <th style={{ ...TH, textAlign: 'right', whiteSpace: 'nowrap' }}>Gross</th>
              <th
                style={{ ...TH, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--c-flag-red)' }}
                title="Est GC Revenue — the double-count removed from Gross"
              >
                − Est GC Rev
              </th>
              <th style={{ ...TH, textAlign: 'right', whiteSpace: 'nowrap' }}>Deduped</th>
              <th style={{ ...TH, textAlign: 'right', whiteSpace: 'nowrap' }}>Net</th>
              <th style={{ ...TH, textAlign: 'right', whiteSpace: 'nowrap' }}>Ontology Net</th>
              <th style={{ ...TH, textAlign: 'center', whiteSpace: 'nowrap', width: 56 }} title="Recycle Rate flag">Rec</th>
              <th style={{ ...TH, textAlign: 'center', whiteSpace: 'nowrap', width: 56 }} title="GC / Gross % flag">GC%</th>
              <th style={{ ...TH, textAlign: 'center', whiteSpace: 'nowrap', width: 56 }} title="HG Risk Score flag">HG</th>
              <th style={{ ...TH, textAlign: 'center', whiteSpace: 'nowrap', width: 56 }} title="Inv Risk Flag (Missing>5 AND Var>0)">Inv</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tooltip = [
                r.store,
                `Gross ${fmtMoney(r.gross, true)} → Ontology Net ${fmtMoney(r.ontology_net, true)}`,
                `Recycle ${fmtPct(r.recycle_rate)} · GC/Gross ${fmtPct(r.gc_gross_pct)}`,
              ].join(' · ');
              return (
                <tr
                  key={r.store}
                  title={tooltip}
                  onClick={() =>
                    onNavigate({
                      type: clickThrough.target_view,
                      id: clickThrough.target_id,
                      anchor: r[clickThrough.anchor_field as 'store'] as string,
                    })
                  }
                  style={{
                    borderBottom: '1px solid var(--c-border)',
                    cursor: 'pointer',
                    background: 'var(--c-panel)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(23,69,106,0.32)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = 'var(--c-white)';
                  }}
                >
                  <td
                    style={{
                      padding: '6px 10px',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      background: 'inherit',
                    }}
                  >
                    {r.store}
                  </td>
                  <td style={TD_NUM}>{fmtMoney(r.gross, true)}</td>
                  <td
                    style={{
                      ...TD_NUM,
                      color: (r.est_gc_revenue || 0) > 0 ? 'var(--c-flag-red)' : 'var(--c-gray)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {r.est_gc_revenue && r.est_gc_revenue > 0
                      ? `−${fmtMoney(r.est_gc_revenue, true)}`
                      : fmtMoney(0, true)}
                  </td>
                  <td style={TD_NUM}>{fmtMoney(r.deduped, true)}</td>
                  <td style={TD_NUM}>{fmtMoney(r.net, true)}</td>
                  <td style={{ ...TD_NUM, fontWeight: 600, color: 'var(--c-teal)' }}>
                    {fmtMoney(r.ontology_net, true)}
                  </td>
                  <FlagCell color={r.recycle_flag} label={fmtPct(r.recycle_rate)} />
                  <FlagCell color={r.gc_gross_flag} label={fmtPct(r.gc_gross_pct)} />
                  <FlagCell
                    color={r.hg_risk_flag}
                    label={r.hg_risk_score === null || r.hg_risk_score === undefined ? '—' : String(r.hg_risk_score)}
                  />
                  <FlagCell
                    color={r.inv_risk_cell_flag}
                    label={r.inv_risk_flag || '—'}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--c-gray)' }}>
        Click any row to open HG Intelligence anchored on that store. Sort: Gross desc.
        Red − Est GC Rev column = the HG gift-card recycling double-count removed from top-line.
        Est GC Rev = GC Issued × Store AOV — estimation, not exact.
      </div>
    </div>
  );
}

function FleetSummary({
  fleet,
  hgRiskDistribution,
}: {
  fleet: FleetAggregate;
  hgRiskDistribution: Record<string, number>;
}) {
  const stages = [
    { label: 'Gross', value: fleet.gross, tone: 'neutral' as const },
    { label: 'Deduped Gross', value: fleet.deduped, tone: 'deducted' as const },
    { label: 'Net', value: fleet.net, tone: 'neutral' as const },
    { label: 'Ontology Net Revenue', value: fleet.ontology_net, tone: 'ontology' as const },
  ];
  const gcInflationPct = fleet.gross ? (fleet.est_gc_revenue / fleet.gross) * 100 : 0;

  return (
    <div
      style={{
        border: '1px solid var(--c-border)',
        borderRadius: 6,
        padding: 12,
        background: 'var(--c-panel)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          fontSize: 11,
          color: 'var(--c-gray)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ alignSelf: 'center', fontWeight: 700, letterSpacing: 0.4 }}>FLEET</span>
        {stages.map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
            <div
              style={{
                padding: '6px 10px',
                border: '1px solid var(--c-border)',
                borderLeft:
                  s.tone === 'ontology'
                    ? '4px solid var(--c-purple)'
                    : s.tone === 'deducted'
                    ? '4px solid var(--c-flag-red)'
                    : '4px solid var(--c-border)',
                borderRadius: 4,
                background: 'var(--c-panel)',
                minWidth: 120,
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--c-white)', fontSize: 14 }}>
                {fmtMoney(s.value, true)}
              </div>
              <div style={{ fontSize: 10 }}>{s.label}</div>
            </div>
            {i < stages.length - 1 && (
              <span
                style={{
                  alignSelf: 'center',
                  color: 'var(--c-gray)',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* GC recycling callout — visible per plan */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'baseline',
          fontSize: 11,
          padding: '6px 10px',
          background: 'rgba(220,86,86,0.08)',
          border: '1px dashed var(--c-flag-red)',
          borderRadius: 4,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: 0.3, color: 'var(--c-flag-red)' }}>
          GC RECYCLING CALLOUT
        </span>
        <span>
          <strong>{fmtMoney(fleet.est_gc_revenue, true)}</strong> estimated GC double-count
          ({gcInflationPct.toFixed(1)}% of gross) across {fleet.stores} stores
        </span>
        {fleet.recycle_median !== null && (
          <span style={{ color: 'var(--c-gray)' }}>
            Fleet Recycle Rate median: <strong>{fmtPct(fleet.recycle_median)}</strong>
          </span>
        )}
      </div>

      {/* HG Risk distribution — matches deck s_m2_insights bullet 5 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          fontSize: 11,
          color: 'var(--c-gray)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: 0.3 }}>HG RISK</span>
        {(['0', '1', '2', '3'] as const).map((k) => {
          const count = hgRiskDistribution[k] ?? 0;
          const color =
            k === '0'
              ? 'var(--c-flag-green)'
              : k === '1'
              ? 'var(--c-flag-yellow)'
              : 'var(--c-flag-red)';
          return (
            <span
              key={k}
              style={{
                padding: '2px 8px',
                border: '1px solid var(--c-border)',
                borderLeft: `3px solid ${color}`,
                borderRadius: 3,
                background: 'var(--c-panel)',
              }}
              title={`${count} stores at HG Risk ${k}`}
            >
              {k} → <strong style={{ color: 'var(--c-white)' }}>{count}</strong>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FlagCell({ color, label }: { color: FlagColor | null; label: string }) {
  return (
    <td
      style={{
        padding: '6px 10px',
        textAlign: 'center',
        background: color ? tint(FLAG_COLOR[color], 18) : undefined,
      }}
      title={color ? `flag: ${color}` : 'no flag'}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
          color: color === 'red' ? 'var(--c-flag-red)' : color === 'yellow' ? 'var(--c-flag-yellow)' : 'var(--c-white)',
        }}
      >
        {color && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: FLAG_COLOR[color],
              boxShadow: '0 0 0 0.5px rgba(0,0,0,0.25) inset',
            }}
          />
        )}
        {label}
      </span>
    </td>
  );
}

const TH: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid var(--c-border)',
  fontWeight: 600,
};

const TD_NUM: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};
