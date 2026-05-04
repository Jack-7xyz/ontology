// Quadrant2D — Fine Revenue Estimation diagram (mechanic #6).
//
// 2D scatter plotting per-store Mix σ (x) × AOV σ (y), with ±1σ cuts drawn
// as dashed lines creating the 5 named zones: High+High (top-right, green),
// High+Low (bottom-right, yellow), Low+High (top-left, yellow), Low+Low
// (bottom-left, red), Mid (central band). Zone background tints match
// cascade-severity colors. Dots colored by severity, sized by opportunity $,
// clickable to drill into Fine Mix Intelligence anchored on the store.
//
// Hover → tooltip with store, fine_mix_pct, fine_aov, mix σ / aov σ,
// fine_flag, opportunity $. Click → onNavigate({type:'bi', id:'fine_mix_intel',
// anchor:<store>}).
//
// Fleet summary strip: fleet mix % · total opportunity $ · zone counts.
// Legend mini-card top-right: zone colors + counts.
//
// Hand-rolled SVG — no chart lib, consistent with StoreRelativeScatter /
// Waterfall / Grid8Domain / CascadeFlowchart. Axis ranges auto-scale from
// data so Park City's +5.4 AOV σ outlier is visible without clipping.

import { useMemo, useState } from 'react';
import type { View } from '../../types';

interface ScatterRow {
  store: string | null;
  traffic_tier: string | null;
  fine_mix_pct: number | null;
  fine_aov: number | null;
  mix_sigma: number | null;
  aov_sigma: number | null;
  quadrant: string | null;       // "High+High" | "High+Low" | "Low+High" | "Low+Low" | "Mid" | null
  quadrant_key: string | null;
  fine_flag: string | null;
  fine_seller_pct: number | null;
  opportunity_d: number | null;
  fine_units: number | null;
  staff_count: number | null;
  net_sales: number | null;
  fine_net_sales: number | null;
  visual_score: number | null;
}

interface ZoneSummary {
  key: string;
  label: string;
  fine_flag: string;
  count: number;
  severity: 'green' | 'yellow' | 'red';
  example_stores: string[];
  criteria: string;
  description: string;
  ontology_fix: string;
}

interface FleetAggregate {
  total_stores: number;
  fleet_fine_net_d: number;
  fleet_net_d: number;
  fleet_mix_pct: number | null;
  fleet_avg_mix_pct: number | null;
  fleet_avg_fine_aov: number | null;
  total_opportunity_d: number;
  top_fine_store_count: number;
  coaching_priority_count: number;
  upsell_opportunity_count: number;
  attach_rate_gap_count: number;
  mid_count: number;
  dropped_no_fine_sellers: number;
}

interface Thresholds {
  sigma_cut: number; // 1.0
}

interface Props {
  rows: ScatterRow[];
  zones: ZoneSummary[];
  fleet: FleetAggregate;
  thresholds: Thresholds;
  clickThrough: { target_view: 'bi'; target_id: string; anchor_field: string };
  onNavigate: (v: View) => void;
}

// --- Formatting ---------------------------------------------------------------

function fmtMoneyCompact(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

function fmtSigma(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}σ`;
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

// --- Severity colors ----------------------------------------------------------

const ZONE_BG: Record<string, string> = {
  'High+High': 'rgba(46,189,133,0.06)',
  'High+Low':  'rgba(245,200,66,0.06)',
  'Low+High':  'rgba(245,200,66,0.06)',
  'Low+Low':   'rgba(220,86,86,0.06)',
  Mid:         'transparent',
};
const SEVERITY_DOT: Record<string, string> = {
  green:  'var(--c-flag-green)',
  yellow: 'var(--c-flag-yellow)',
  red:    'var(--c-flag-red)',
};
const SEVERITY_BORDER: Record<string, string> = {
  green:  '#4CCB7F',
  yellow: '#F5C542',
  red:    '#E04B4B',
};
const QUADRANT_SEVERITY: Record<string, 'green' | 'yellow' | 'red'> = {
  'High+High': 'green',
  'High+Low':  'yellow',
  'Low+High':  'yellow',
  'Low+Low':   'red',
};

// --- Plot geometry ------------------------------------------------------------

const PLOT_W = 540;
const PLOT_H = 330;
const M = { top: 16, right: 18, bottom: 42, left: 48 };

// Axis ranges — clamp to visible range so Park City's +5.4 AOV σ is a visible
// outlier without squashing the main cluster. x = Mix σ ranges ~[-3, +3],
// y = AOV σ ranges ~[-2, +6]. Asymmetric y to accommodate the Park City tail.
const X_MIN = -3.0;
const X_MAX = 3.0;
const Y_MIN = -2.5;
const Y_MAX = 6.0;

function xScale(x: number): number {
  return M.left + ((x - X_MIN) / (X_MAX - X_MIN)) * (PLOT_W - M.left - M.right);
}
function yScale(y: number): number {
  return M.top + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (PLOT_H - M.top - M.bottom);
}

const X_TICKS = [-3, -2, -1, 0, 1, 2, 3];
const Y_TICKS = [-2, -1, 0, 1, 2, 3, 4, 5, 6];

// --- Sub-components (defined before Quadrant2D to avoid Vite hoisting issues) --

function LegendPanel({ zones }: { zones: ZoneSummary[] }) {
  return (
    <div
      style={{
        flexShrink: 0,
        width: 148,
        border: '1px solid #E0E0E6',
        borderRadius: 4,
        padding: '6px 0',
        background: 'var(--c-panel)',
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 10,
      }}
    >
      {zones.map((z) => {
        const dot =
          z.severity === 'green'
            ? SEVERITY_DOT.green
            : z.severity === 'yellow'
              ? SEVERITY_DOT.yellow
              : z.severity === 'red'
                ? SEVERITY_DOT.red
                : 'rgba(160,160,170,0.55)';
        const border =
          z.severity === 'green'
            ? SEVERITY_BORDER.green
            : z.severity === 'yellow'
              ? SEVERITY_BORDER.yellow
              : z.severity === 'red'
                ? SEVERITY_BORDER.red
                : 'var(--c-border)';
        return (
          <div
            key={z.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
            }}
          >
            <svg width={10} height={10} style={{ flexShrink: 0 }}>
              <circle cx={5} cy={5} r={4} fill={dot} stroke={border} strokeWidth={1} />
            </svg>
            <span style={{ flex: 1, color: 'var(--c-white)' }}>{z.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--c-white)' }}>{z.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Component ----------------------------------------------------------------

export function Quadrant2D({
  rows,
  zones,
  fleet,
  thresholds,
  clickThrough,
  onNavigate,
}: Props) {
  const [hover, setHover] = useState<{ row: ScatterRow; x: number; y: number } | null>(null);

  // Split rows into plottable (both σ present) + dropped (either blank).
  const { plottable } = useMemo(() => {
    const p: ScatterRow[] = [];
    const d: ScatterRow[] = [];
    for (const r of rows) {
      if (r.mix_sigma !== null && r.aov_sigma !== null) p.push(r);
      else d.push(r);
    }
    return { plottable: p, dropped: d };
  }, [rows]);

  // Render order: Mid first (bottom layer), then colored zones on top so the
  // deck-spotlight stores land above the quiet cluster.
  const renderOrder = useMemo(() => {
    const mid = plottable.filter((r) => r.quadrant === 'Mid');
    const colored = plottable.filter((r) => r.quadrant !== 'Mid');
    // Colored: severity order red→yellow→green so green dots land on top
    const sevRank: Record<string, number> = { red: 0, yellow: 1, green: 2 };
    colored.sort((a, b) => {
      const sa = sevRank[QUADRANT_SEVERITY[a.quadrant ?? ''] ?? 'red'] ?? 0;
      const sb = sevRank[QUADRANT_SEVERITY[b.quadrant ?? ''] ?? 'red'] ?? 0;
      return sa - sb;
    });
    return [...mid, ...colored];
  }, [plottable]);

  const cut = thresholds.sigma_cut;
  const xCutPos = xScale(cut);
  const xCutNeg = xScale(-cut);
  const yCutPos = yScale(cut);
  const yCutNeg = yScale(-cut);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Summary fleet={fleet} />

      <div
        style={{
          border: '10px solid var(--c-panel-3)',
          boxShadow: '0 0 0 1px var(--c-border)',
          borderRadius: 6,
          padding: 18,
          background: 'var(--c-panel)',
          position: 'relative',
          width: '100%',
          maxWidth: 860,
          alignSelf: 'center',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <svg
          width="100%"
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          style={{ display: 'block', overflow: 'visible', flex: '1 1 0', minWidth: 0, height: 'auto' }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Zone background tints — 4 corners get a subtle severity wash. */}
          <rect
            x={xCutPos}
            y={M.top}
            width={PLOT_W - M.right - xCutPos}
            height={yCutPos - M.top}
            fill={ZONE_BG['High+High']}
          />
          <rect
            x={xCutPos}
            y={yCutNeg}
            width={PLOT_W - M.right - xCutPos}
            height={PLOT_H - M.bottom - yCutNeg}
            fill={ZONE_BG['High+Low']}
          />
          <rect
            x={M.left}
            y={M.top}
            width={xCutNeg - M.left}
            height={yCutPos - M.top}
            fill={ZONE_BG['Low+High']}
          />
          <rect
            x={M.left}
            y={yCutNeg}
            width={xCutNeg - M.left}
            height={PLOT_H - M.bottom - yCutNeg}
            fill={ZONE_BG['Low+Low']}
          />

          {/* Plot border */}
          <rect
            x={M.left}
            y={M.top}
            width={PLOT_W - M.left - M.right}
            height={PLOT_H - M.top - M.bottom}
            fill="none"
            stroke="#E0E0E6"
            strokeWidth={1}
          />

          {/* Axis gridlines at each tick */}
          {X_TICKS.map((t) => (
            <line
              key={`gx-${t}`}
              x1={xScale(t)}
              x2={xScale(t)}
              y1={M.top}
              y2={PLOT_H - M.bottom}
              stroke="var(--c-border)"
              strokeWidth={0.75}
            />
          ))}
          {Y_TICKS.map((t) => (
            <line
              key={`gy-${t}`}
              x1={M.left}
              x2={PLOT_W - M.right}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="var(--c-border)"
              strokeWidth={0.75}
            />
          ))}

          {/* ±1σ cut lines (dashed) — the geometry that defines the zones */}
          <line
            x1={xCutPos}
            x2={xCutPos}
            y1={M.top}
            y2={PLOT_H - M.bottom}
            stroke="var(--c-purple)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          <line
            x1={xCutNeg}
            x2={xCutNeg}
            y1={M.top}
            y2={PLOT_H - M.bottom}
            stroke="var(--c-purple)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          <line
            x1={M.left}
            x2={PLOT_W - M.right}
            y1={yCutPos}
            y2={yCutPos}
            stroke="var(--c-purple)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          <line
            x1={M.left}
            x2={PLOT_W - M.right}
            y1={yCutNeg}
            y2={yCutNeg}
            stroke="var(--c-purple)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            opacity={0.7}
          />

          {/* Zone labels — one per corner, small + muted so they don't dominate */}
          <ZoneLabel x={xScale(1.9)} y={yScale(5.0)} label="High+High" sub="Top Fine" sev="green" />
          <ZoneLabel x={xScale(1.9)} y={yScale(-1.7)} label="High+Low" sub="Upsell" sev="yellow" />
          <ZoneLabel x={xScale(-2.2)} y={yScale(5.0)} label="Low+High" sub="Attach Gap" sev="yellow" />
          <ZoneLabel x={xScale(-2.2)} y={yScale(-1.7)} label="Low+Low" sub="Coaching" sev="red" />
          <ZoneLabel x={xScale(0)} y={yScale(0)} label="Mid" sub="steady" sev="neutral" centered />

          {/* X axis */}
          <line
            x1={M.left}
            x2={PLOT_W - M.right}
            y1={PLOT_H - M.bottom}
            y2={PLOT_H - M.bottom}
            stroke="var(--c-border)"
            strokeWidth={1}
          />
          {X_TICKS.map((t) => (
            <g key={`xt-${t}`}>
              <line
                x1={xScale(t)}
                x2={xScale(t)}
                y1={PLOT_H - M.bottom}
                y2={PLOT_H - M.bottom + 4}
                stroke="var(--c-border)"
              />
              <text
                x={xScale(t)}
                y={PLOT_H - M.bottom + 16}
                fontSize={10}
                textAnchor="middle"
                fill="var(--c-gray)"
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
              >
                {t > 0 ? `+${t}` : `${t}`}
              </text>
            </g>
          ))}
          <text
            x={(M.left + PLOT_W - M.right) / 2}
            y={PLOT_H - 12}
            fontSize={11}
            textAnchor="middle"
            fill="var(--c-white)"
          >
            Mix σ (z-score of Fine Mix %)
          </text>

          {/* Y axis */}
          <line
            x1={M.left}
            x2={M.left}
            y1={M.top}
            y2={PLOT_H - M.bottom}
            stroke="var(--c-border)"
            strokeWidth={1}
          />
          {Y_TICKS.map((t) => (
            <g key={`yt-${t}`}>
              <line
                x1={M.left - 4}
                x2={M.left}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="var(--c-border)"
              />
              <text
                x={M.left - 8}
                y={yScale(t) + 3}
                fontSize={10}
                textAnchor="end"
                fill="var(--c-gray)"
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
              >
                {t > 0 ? `+${t}` : `${t}`}
              </text>
            </g>
          ))}
          <text
            x={14}
            y={(M.top + PLOT_H - M.bottom) / 2}
            fontSize={11}
            textAnchor="middle"
            fill="var(--c-white)"
            transform={`rotate(-90 14 ${(M.top + PLOT_H - M.bottom) / 2})`}
          >
            AOV σ (z-score of Fine AOV)
          </text>

          {/* Dots — rendered in severity order so the coaching/recognition
              dots land on top of the Mid cluster. */}
          {renderOrder.map((r) => {
            const sev = QUADRANT_SEVERITY[r.quadrant ?? ''] ?? null;
            const isMid = r.quadrant === 'Mid';
            const mx = Math.max(X_MIN, Math.min(X_MAX, r.mix_sigma!));
            const my = Math.max(Y_MIN, Math.min(Y_MAX, r.aov_sigma!));
            const cx = xScale(mx);
            const cy = yScale(my);
            // Radius scaled by opportunity $ magnitude — positive = coach target,
            // negative = over-index (recognition). Cap radius so outliers don't
            // dominate.
            const oppMag = Math.abs(r.opportunity_d ?? 0);
            const base = isMid ? 2.5 : 3.75;
            const extra = Math.min(2.25, Math.sqrt(oppMag / 3500));
            const radius = base + (isMid ? 0 : extra);
            const fill = isMid
              ? 'rgba(160,160,170,0.35)'
              : sev
                ? SEVERITY_DOT[sev]
                : 'rgba(160,160,170,0.35)';
            const stroke = isMid
              ? 'var(--c-border)'
              : sev
                ? SEVERITY_BORDER[sev]
                : 'var(--c-border)';
            const isOutOfRange =
              r.mix_sigma! > X_MAX ||
              r.mix_sigma! < X_MIN ||
              r.aov_sigma! > Y_MAX ||
              r.aov_sigma! < Y_MIN;
            return (
              <g key={r.store ?? `${cx}-${cy}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={fill}
                  fillOpacity={isMid ? 0.55 : 0.85}
                  stroke={stroke}
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) =>
                    setHover({
                      row: r,
                      x: (e.nativeEvent as MouseEvent).offsetX,
                      y: (e.nativeEvent as MouseEvent).offsetY,
                    })
                  }
                  onMouseMove={(e) =>
                    setHover({
                      row: r,
                      x: (e.nativeEvent as MouseEvent).offsetX,
                      y: (e.nativeEvent as MouseEvent).offsetY,
                    })
                  }
                  onClick={() =>
                    r.store
                      ? onNavigate({
                          type: clickThrough.target_view,
                          id: clickThrough.target_id,
                          anchor: r.store,
                        })
                      : undefined
                  }
                />
                {isOutOfRange && (
                  <text
                    x={cx + radius + 4}
                    y={cy + 3}
                    fontSize={9}
                    fill={SEVERITY_BORDER[sev ?? 'green']}
                    fontFamily="ui-monospace, Menlo, Consolas, monospace"
                  >
                    ›
                  </text>
                )}
              </g>
            );
          })}

        </svg>

        <LegendPanel zones={zones} />

        {hover && (
          <Tooltip
            row={hover.row}
            x={hover.x}
            y={hover.y}
          />
        )}
      </div>

      <div
        style={{
          fontSize: 11,
          color: 'var(--c-gray)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div>
          Click any store to open Fine Mix Intelligence scroll-anchored on that row.
          Dashed lines mark the ±1σ cuts. Mid-band stores render as a muted
          background cluster so the 4 action quadrants stay visually dominant.
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border)',
            borderLeft: '3px solid var(--c-purple)',
            borderRadius: 4,
            padding: '4px 10px',
            color: 'var(--c-white)',
            fontSize: 11,
          }}
        >
          Opportunity $ = (fleet avg fine mix % × store net sales) − store fine net sales
        </div>
      </div>
    </div>
  );
}

// --- Remaining sub-components -------------------------------------------------

function ZoneLabel({
  x,
  y,
  label,
  sub,
  sev,
  centered,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  sev: 'green' | 'yellow' | 'red' | 'neutral';
  centered?: boolean;
}) {
  const color =
    sev === 'neutral' ? 'var(--c-gray)' : SEVERITY_BORDER[sev];
  return (
    <g>
      <text
        x={x}
        y={y - 4}
        fontSize={11}
        fontWeight={700}
        textAnchor={centered ? 'middle' : 'middle'}
        fill={color}
        opacity={0.75}
      >
        {label}
      </text>
      <text
        x={x}
        y={y + 8}
        fontSize={9}
        textAnchor={centered ? 'middle' : 'middle'}
        fill="var(--c-gray)"
        opacity={0.7}
        fontStyle="italic"
      >
        {sub}
      </text>
    </g>
  );
}

function Tooltip({ row, x, y }: { row: ScatterRow; x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.min(x + 14, PLOT_W - 240),
        top: Math.max(y - 20, 8),
        pointerEvents: 'none',
        background: 'rgba(30,30,40,0.94)',
        color: '#FFF',
        padding: '8px 10px',
        borderRadius: 4,
        fontSize: 11,
        lineHeight: 1.45,
        maxWidth: 260,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
        {row.store ?? '—'}
      </div>
      <Line label="quadrant" value={row.quadrant ?? '—'} />
      <Line label="fine flag" value={row.fine_flag || '—'} />
      <Line label="mix σ" value={fmtSigma(row.mix_sigma)} />
      <Line label="aov σ" value={fmtSigma(row.aov_sigma)} />
      <Line label="fine mix %" value={fmtPct(row.fine_mix_pct, 1)} />
      <Line label="fine aov" value={fmtMoney(row.fine_aov)} />
      <Line
        label="opportunity"
        value={
          row.opportunity_d !== null && row.opportunity_d !== undefined
            ? (row.opportunity_d > 0
                ? `+${fmtMoneyCompact(row.opportunity_d)}`
                : fmtMoneyCompact(row.opportunity_d))
            : '—'
        }
      />
      <div style={{ marginTop: 4, fontSize: 10, color: '#C0C0CA' }}>
        click to open Fine Mix Intel
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
      <span style={{ color: '#C0C0CA' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function Summary({ fleet }: { fleet: FleetAggregate }) {
  const items: { label: string; value: string; tone: 'accent' | 'neutral' }[] = [
    {
      label: 'fleet fine mix',
      value: fmtPct(fleet.fleet_mix_pct, 1),
      tone: 'accent',
    },
    {
      label: 'total opportunity',
      value: fmtMoneyCompact(fleet.total_opportunity_d),
      tone: 'accent',
    },
    {
      label: 'Top Fine',
      value: String(fleet.top_fine_store_count),
      tone: 'neutral',
    },
    {
      label: 'Coaching Priority',
      value: String(fleet.coaching_priority_count),
      tone: 'neutral',
    },
    {
      label: 'Upsell Opp.',
      value: String(fleet.upsell_opportunity_count),
      tone: 'neutral',
    },
    {
      label: 'Attach Gap',
      value: String(fleet.attach_rate_gap_count),
      tone: 'neutral',
    },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexWrap: 'wrap',
        border: '1px solid var(--c-border)',
        borderRadius: 6,
        padding: 10,
        background: 'var(--c-panel)',
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--c-border)',
            borderLeft:
              it.tone === 'accent'
                ? '4px solid var(--c-purple)'
                : '4px solid var(--c-border)',
            borderRadius: 4,
            minWidth: 110,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-white)' }}>
            {it.value}
          </div>
          <div style={{ fontSize: 10, color: 'var(--c-gray)' }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
