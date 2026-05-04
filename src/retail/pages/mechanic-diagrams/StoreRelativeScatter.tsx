// StoreRelativeScatter — HG Processor Detection diagram (mechanic #4).
//
// 2D scatter of associate refund-rate (y) vs own-store return-rate (x), with
// the +10pp diagonal (y = x + 0.10) drawn as a dashed line and the flag region
// (above diagonal AND refund_d >= $5K gross floor) shaded light red. Non-
// flagged associates render as small gray dots; flagged associates render as
// larger red dots on top. Hover → tooltip with associate · store · refund % ·
// delta · refund $. Click flagged dot → navigate to Associate Performance
// anchored on the staff_id.
//
// Fleet summary strip above the plot: flagged_count / total · flagged $ ·
// stores affected. Mini-legend top-right explains diagonal + shaded region +
// $5K floor.
//
// Hand-rolled SVG — no chart lib, consistent with Waterfall / Grid8Domain /
// CascadeFlowchart. Axes in % (0, 5, 10, 15, 20+); data clamped to [0, 1.25]
// to handle associates whose refund rate exceeds gross (Carlsbad 124.7%,
// Naperville 123.0%).

import { useMemo, useState } from 'react';
import type { View } from '../../types';

interface ScatterRow {
  associate_id: number | string;
  associate_name: string | null;
  store: string | null;
  refund_rate: number;          // 0.0 .. 1.25ish
  store_return_rate: number;    // 0.0 .. ~0.4
  delta_pp: number;             // refund_rate - store_return_rate
  refund_d: number;
  gross_d: number;
  is_flagged: boolean;
}

interface FleetAggregate {
  total_associates: number;
  flagged_count: number;
  flagged_refund_d: number;
  flagged_gross_d: number;
  stores_affected: number;
  dropped_no_baseline: number;
}

interface Thresholds {
  delta_pp: number;       // 0.10
  refund_floor_d: number; // 5000
}

interface DeltaBin {
  label: string;   // "+10 to +20pp"
  bottom: number;  // 0.10
  top: number;     // 0.20
  count: number;
}

interface Props {
  rows: ScatterRow[];
  fleet: FleetAggregate;
  thresholds: Thresholds;
  bins?: DeltaBin[];
  clickThrough: { target_view: 'bi'; target_id: string; anchor_field: string };
  onNavigate: (v: View) => void;
}

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

function fmtDeltaPp(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const pct = v * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}pp`;
}

// Plot extents — locked so the diagonal + flagged region render the same every
// render. y extends slightly above 1.0 so 124% refund-rate rows are visible.
const X_MIN = 0;
const X_MAX = 0.40;  // store return rates cap below this in the data
const Y_MIN = 0;
const Y_MAX = 1.30;  // Carlsbad 124.7%, Naperville 123.0%

// SVG plot dimensions + margins (px).
const PLOT_W = 720;
const PLOT_H = 420;
const M = { top: 18, right: 28, bottom: 44, left: 56 };

function xScale(x: number): number {
  return M.left + ((x - X_MIN) / (X_MAX - X_MIN)) * (PLOT_W - M.left - M.right);
}
function yScale(y: number): number {
  // SVG y grows downward; invert.
  return M.top + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * (PLOT_H - M.top - M.bottom);
}

const X_TICKS = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40];
const Y_TICKS = [0, 0.10, 0.20, 0.30, 0.50, 0.75, 1.00, 1.25];

export function StoreRelativeScatter({
  rows,
  fleet,
  thresholds,
  bins,
  clickThrough,
  onNavigate,
}: Props) {
  const [hover, setHover] = useState<{ row: ScatterRow; x: number; y: number } | null>(null);

  // Split + clamp for plotting; flagged rows render on top so they aren't
  // occluded by the non-flagged cloud.
  const { nonFlagged, flaggedRows } = useMemo(() => {
    const nf: ScatterRow[] = [];
    const fl: ScatterRow[] = [];
    for (const r of rows) {
      if (r.is_flagged) fl.push(r);
      else nf.push(r);
    }
    return { nonFlagged: nf, flaggedRows: fl };
  }, [rows]);

  const flaggedPct =
    fleet.total_associates > 0
      ? ((fleet.flagged_count / fleet.total_associates) * 100).toFixed(1)
      : '0.0';

  // Diagonal endpoints y = x + delta_pp, clamped to [Y_MIN, Y_MAX].
  const diagX1 = X_MIN;
  const diagY1 = Math.min(Math.max(diagX1 + thresholds.delta_pp, Y_MIN), Y_MAX);
  const diagX2 = X_MAX;
  const diagY2 = Math.min(Math.max(diagX2 + thresholds.delta_pp, Y_MIN), Y_MAX);

  // Flagged region polygon: above the diagonal, across the full x range, up
  // to Y_MAX. (The $5K floor is an additional condition on dot color, NOT on
  // the shaded band — shading the floor band would require a dollar axis.)
  const flagRegion = [
    `${xScale(diagX1)},${yScale(diagY1)}`,
    `${xScale(diagX2)},${yScale(diagY2)}`,
    `${xScale(diagX2)},${yScale(Y_MAX)}`,
    `${xScale(diagX1)},${yScale(Y_MAX)}`,
  ].join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Fleet summary strip */}
      <FleetSummary fleet={fleet} flaggedPct={flaggedPct} thresholds={thresholds} />

      {/* Scatter + histogram side by side */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>

      {/* Plot */}
      <div
        style={{
          position: 'relative',
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border)',
          borderRadius: 6,
          padding: 8,
          overflow: 'auto',
          flex: '1 1 0',
          minWidth: 0,
        }}
      >
        <svg
          width={PLOT_W}
          height={PLOT_H}
          style={{ display: 'block', maxWidth: '100%' }}
          role="img"
          aria-label="Associate refund rate vs store return rate scatter"
        >
          {/* Plot background */}
          <rect
            x={M.left}
            y={M.top}
            width={PLOT_W - M.left - M.right}
            height={PLOT_H - M.top - M.bottom}
            fill="var(--c-white)"
          />

          {/* Flagged region shade */}
          <polygon
            points={flagRegion}
            fill="var(--c-flag-red)"
            fillOpacity={0.07}
            stroke="none"
          />

          {/* Grid + x ticks */}
          {X_TICKS.map((t) => (
            <g key={`xt-${t}`}>
              <line
                x1={xScale(t)}
                x2={xScale(t)}
                y1={M.top}
                y2={PLOT_H - M.bottom}
                stroke="var(--c-border)"
                strokeWidth={1}
              />
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
                fill="var(--c-gray)"
                textAnchor="middle"
              >
                {`${Math.round(t * 100)}%`}
              </text>
            </g>
          ))}
          {/* Y ticks */}
          {Y_TICKS.map((t) => (
            <g key={`yt-${t}`}>
              <line
                x1={M.left}
                x2={PLOT_W - M.right}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="var(--c-border)"
                strokeWidth={1}
              />
              <line
                x1={M.left - 4}
                x2={M.left}
                y1={yScale(t)}
                y2={yScale(t)}
                stroke="var(--c-border)"
              />
              <text
                x={M.left - 7}
                y={yScale(t) + 3}
                fontSize={10}
                fill="var(--c-gray)"
                textAnchor="end"
              >
                {`${Math.round(t * 100)}%`}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line
            x1={M.left}
            x2={PLOT_W - M.right}
            y1={PLOT_H - M.bottom}
            y2={PLOT_H - M.bottom}
            stroke="var(--c-border)"
          />
          <line
            x1={M.left}
            x2={M.left}
            y1={M.top}
            y2={PLOT_H - M.bottom}
            stroke="var(--c-border)"
          />
          {/* Axis labels */}
          <text
            x={(M.left + PLOT_W - M.right) / 2}
            y={PLOT_H - 6}
            fontSize={11}
            fill="var(--c-white)"
            textAnchor="middle"
            fontWeight={600}
          >
            Store Return Rate →
          </text>
          <text
            x={-(M.top + (PLOT_H - M.bottom)) / 2}
            y={14}
            fontSize={11}
            fill="var(--c-white)"
            textAnchor="middle"
            fontWeight={600}
            transform={`rotate(-90)`}
          >
            Associate Refund Rate ↑
          </text>

          {/* +10pp diagonal (dashed) */}
          <line
            x1={xScale(diagX1)}
            y1={yScale(diagY1)}
            x2={xScale(diagX2)}
            y2={yScale(diagY2)}
            stroke="var(--c-flag-red)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            opacity={0.75}
          />

          {/* Non-flagged dots */}
          {nonFlagged.map((r, i) => {
            const cx = xScale(Math.min(Math.max(r.store_return_rate, X_MIN), X_MAX));
            const cy = yScale(Math.min(Math.max(r.refund_rate, Y_MIN), Y_MAX));
            return (
              <circle
                key={`nf-${r.associate_id}-${i}`}
                cx={cx}
                cy={cy}
                r={2.2}
                fill="var(--c-gray)"
                fillOpacity={0.45}
                stroke="none"
                style={{ cursor: 'default' }}
                onMouseEnter={() => setHover({ row: r, x: cx, y: cy })}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}

          {/* Flagged dots (on top) */}
          {flaggedRows.map((r, i) => {
            const cx = xScale(Math.min(Math.max(r.store_return_rate, X_MIN), X_MAX));
            const cy = yScale(Math.min(Math.max(r.refund_rate, Y_MIN), Y_MAX));
            const aboveFloor = r.refund_d >= thresholds.refund_floor_d;
            return (
              <g key={`fl-${r.associate_id}-${i}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill="var(--c-flag-red)"
                  fillOpacity={aboveFloor ? 0.88 : 0.55}
                  stroke="var(--c-white)"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover({ row: r, x: cx, y: cy })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() =>
                    onNavigate({
                      type: clickThrough.target_view,
                      id: clickThrough.target_id,
                      anchor: String(r.associate_id),
                    })
                  }
                />
              </g>
            );
          })}

          {/* Legend — top-right */}
          <g transform={`translate(${PLOT_W - M.right - 218}, ${M.top + 6})`}>
            <rect
              x={0}
              y={0}
              width={214}
              height={74}
              rx={4}
              fill="var(--c-panel)"
              stroke="var(--c-border)"
            />
            <line
              x1={10}
              y1={18}
              x2={34}
              y2={18}
              stroke="var(--c-flag-red)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text x={40} y={21} fontSize={10} fill="var(--c-white)">
              +10pp diagonal (flag boundary)
            </text>
            <rect
              x={10}
              y={30}
              width={24}
              height={10}
              fill="var(--c-flag-red)"
              fillOpacity={0.15}
              stroke="none"
            />
            <text x={40} y={39} fontSize={10} fill="var(--c-white)">
              flag region (delta &gt; +10pp)
            </text>
            <circle cx={22} cy={54} r={4.5} fill="var(--c-flag-red)" fillOpacity={0.88} />
            <text x={40} y={57} fontSize={10} fill="var(--c-white)">
              flagged (AND gross &gt; $5K)
            </text>
            <circle cx={22} cy={67} r={2.2} fill="var(--c-gray)" fillOpacity={0.7} />
            <text x={40} y={70} fontSize={10} fill="var(--c-white)">
              non-flagged associate
            </text>
          </g>
        </svg>

        {/* HTML tooltip overlay */}
        {hover && <Tooltip row={hover.row} x={hover.x} y={hover.y} />}
      </div>

      {/* Histogram — right panel, same height as scatter card */}
      {bins && bins.length > 0 && <DeltaHistogram bins={bins} />}

      </div>{/* end side-by-side row */}

      <div style={{ fontSize: 11, color: 'var(--c-gray)' }}>
        Click any flagged (red) associate to open Associate Performance anchored on that staff ID.
        Detection rule: refund rate &gt; own-store return rate by &gt;10pp AND gross &gt; $5K.
        Store-relative — adapts to each store's natural return regime.
      </div>
    </div>
  );
}

function DeltaHistogram({ bins }: { bins: DeltaBin[] }) {
  const maxCount = Math.max(...bins.map((b) => b.count), 1);

  // Fixed panel dimensions — sits alongside the scatter card (~436px tall).
  const W = 300;
  const H = 420;
  const MB = { top: 16, right: 14, bottom: 100, left: 32 };
  const innerW = W - MB.left - MB.right;
  const innerH = H - MB.top - MB.bottom;
  const barW = innerW / bins.length;
  const barPad = 3;

  const axisY = MB.top + innerH;

  return (
    <div
      style={{
        flexShrink: 0,
        width: W + 24,
        background: 'var(--c-panel)',
        border: '1px solid var(--c-border)',
        borderRadius: 6,
        padding: '10px 10px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-white)', marginBottom: 6, lineHeight: 1.3 }}>
        Flagged associates<br />by delta pp (refund vs store)
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', height: 'auto' }}
      >
        {/* Gridlines + y labels */}
        {[0.25, 0.5, 0.75, 1.0].map((frac) => {
          const y = MB.top + innerH * (1 - frac);
          return (
            <g key={frac}>
              <line x1={MB.left} x2={W - MB.right} y1={y} y2={y} stroke="var(--c-border)" strokeWidth={1} />
              <text x={MB.left - 4} y={y + 3} fontSize={9} textAnchor="end" fill="var(--c-gray)">
                {Math.round(frac * maxCount)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {bins.map((b, i) => {
          const bh = (b.count / maxCount) * innerH;
          const x = MB.left + i * barW + barPad;
          const y = axisY - bh;
          const isBorderline = b.bottom < 0.30;
          const barInnerW = barW - barPad * 2;
          const barCx = x + barInnerW / 2;
          return (
            <g key={b.label}>
              <rect
                x={x} y={y}
                width={barInnerW} height={bh}
                fill={isBorderline ? 'var(--c-flag-red)' : 'rgba(220,86,86,0.4)'}
                fillOpacity={isBorderline ? 0.8 : 0.7}
                rx={2}
              />
              {b.count > 0 && (
                <text x={barCx} y={y - 3} fontSize={8} textAnchor="middle" fill="var(--c-white)" fontWeight={600}>
                  {b.count}
                </text>
              )}
              {/* Vertical x-axis label */}
              <text
                x={barCx}
                y={axisY + 6}
                fontSize={8}
                textAnchor="start"
                fill="var(--c-gray)"
                transform={`rotate(45, ${barCx}, ${axisY + 6})`}
              >
                {b.label}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={MB.left} x2={W - MB.right} y1={axisY} y2={axisY} stroke="var(--c-border)" strokeWidth={1} />
        <line x1={MB.left} x2={MB.left} y1={MB.top} y2={axisY} stroke="var(--c-border)" strokeWidth={1} />
      </svg>
      <div style={{ fontSize: 9, color: 'var(--c-flag-red)', marginTop: 4, lineHeight: 1.3 }}>
        Darker = borderline cohort (+10–30pp). Likely low performers, not cyclers.
      </div>
    </div>
  );
}

function Tooltip({ row, x, y }: { row: ScatterRow; x: number; y: number }) {
  // Simple overlay — position to the right of the dot unless near the right
  // edge. 180px wide tooltip; offset 10px from the dot.
  const rightEdge = x > PLOT_W - 200;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: rightEdge ? x - 190 : x + 10,
    top: Math.max(8, y - 36),
    background: 'var(--c-panel)',
    border: '1px solid var(--c-border)',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 11,
    lineHeight: 1.4,
    pointerEvents: 'none',
    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
    maxWidth: 200,
    zIndex: 10,
  };
  return (
    <div style={style}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>
        {row.associate_name ?? `Staff ${row.associate_id}`}
        {row.is_flagged && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 9,
              fontWeight: 700,
              color: 'var(--c-flag-red)',
              padding: '1px 5px',
              border: '1px solid var(--c-flag-red)',
              borderRadius: 2,
              letterSpacing: 0.3,
            }}
          >
            HG PROC
          </span>
        )}
      </div>
      <div style={{ color: 'var(--c-gray)', marginBottom: 4 }}>{row.store ?? '—'}</div>
      <div>
        refund <strong>{fmtPct(row.refund_rate)}</strong> · store{' '}
        <strong>{fmtPct(row.store_return_rate)}</strong>
      </div>
      <div>
        delta <strong style={{ color: row.delta_pp > 0.10 ? 'var(--c-flag-red)' : 'var(--c-white)' }}>
          {fmtDeltaPp(row.delta_pp)}
        </strong>
      </div>
      <div>
        refund $<strong>{fmtMoneyCompact(row.refund_d)}</strong> · gross{' '}
        <strong>{fmtMoneyCompact(row.gross_d)}</strong>
      </div>
    </div>
  );
}

function FleetSummary({
  fleet,
  flaggedPct,
  thresholds,
}: {
  fleet: FleetAggregate;
  flaggedPct: string;
  thresholds: Thresholds;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--c-border)',
        borderRadius: 6,
        padding: 12,
        background: 'var(--c-panel)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'stretch',
      }}
    >
      <span
        style={{
          alignSelf: 'center',
          fontWeight: 700,
          letterSpacing: 0.4,
          fontSize: 11,
          color: 'var(--c-gray)',
        }}
      >
        FLEET
      </span>
      <StatTile
        label="flagged / total"
        value={`${fleet.flagged_count} / ${fleet.total_associates}`}
        hint={`${flaggedPct}%`}
        tone="accent"
      />
      <StatTile
        label="flagged refund $"
        value={fmtMoneyCompact(fleet.flagged_refund_d)}
        tone="red"
      />
      <StatTile
        label="flagged gross $"
        value={fmtMoneyCompact(fleet.flagged_gross_d)}
        tone="neutral"
      />
      <StatTile
        label="stores affected"
        value={String(fleet.stores_affected)}
        tone="neutral"
      />
      <div
        style={{
          marginLeft: 'auto',
          alignSelf: 'center',
          fontSize: 11,
          color: 'var(--c-gray)',
          background: 'rgba(220,86,86,0.08)',
          border: '1px dashed var(--c-flag-red)',
          borderRadius: 4,
          padding: '4px 8px',
        }}
      >
        <strong style={{ color: 'var(--c-flag-red)', letterSpacing: 0.3 }}>RULE</strong>
        {'  '}delta &gt; +{Math.round(thresholds.delta_pp * 100)}pp{'  AND  '}
        gross &gt; {fmtMoneyCompact(thresholds.refund_floor_d)}
        {fleet.dropped_no_baseline > 0 && (
          <span style={{ marginLeft: 8, color: 'var(--c-gray)' }}>
            · {fleet.dropped_no_baseline} no baseline (unmatched)
          </span>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'neutral' | 'accent' | 'red';
}) {
  const borderLeft =
    tone === 'accent'
      ? '4px solid var(--c-purple)'
      : tone === 'red'
      ? '4px solid var(--c-flag-red)'
      : '4px solid var(--c-border)';
  const valueColor =
    tone === 'red' ? 'var(--c-flag-red)' : tone === 'accent' ? 'var(--c-teal)' : 'var(--c-white)';
  return (
    <div
      style={{
        padding: '6px 10px',
        border: '1px solid var(--c-border)',
        borderLeft,
        borderRadius: 4,
        background: 'var(--c-panel)',
        minWidth: 120,
      }}
    >
      <div style={{ fontWeight: 700, color: valueColor, fontSize: 14 }}>
        {value}
        {hint && (
          <span style={{ fontSize: 10, color: 'var(--c-gray)', marginLeft: 4, fontWeight: 500 }}>
            {hint}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--c-gray)' }}>{label}</div>
    </div>
  );
}
