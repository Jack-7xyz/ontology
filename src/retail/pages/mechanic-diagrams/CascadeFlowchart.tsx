// CascadeFlowchart — SHARED cascade diagram used by multiple mechanics.
//
// Renders a vertical top-to-bottom flow: a source node ("120 stores") feeding
// into N sequential bucket nodes. Each bucket shows label, count, severity
// color band, and a hover tooltip with example stores + criteria. Between
// buckets: an arrow + the running "residual" count (stores not yet matched
// by any prior bucket — for the first N-1 buckets; the last bucket is the
// default / residual).
//
// Parameterized by:
//   - buckets[]: array of any length (attr_gap = 7, perf_flag_cascade = 5)
//   - source_label: top-of-cascade input total ("120 stores", "847 associates")
//   - clickThrough.filter_field: the BI column to filter on when a bucket is
//     clicked (primary_flag for attr_gap, flag for perf_flag_cascade)
//
// Click bucket → onNavigate({type:'bi', id:<target_id>, filter: <bucket.label>}).
// BiTable receives the `filter_field` + `filter` props and applies a
// client-side row filter by the intended categorical column.
//
// Visual idiom mirrors Waterfall / Grid8Domain: neutral card background,
// severity colors from CSS vars, hover affordance on every clickable node.
import type { FlagColor, View } from '../../types';

export interface CascadeBucket {
  key: string;
  label: string;
  filter_value?: string;
  count: number;
  severity: FlagColor;
  example_stores: string[];
  criteria: string;
  description: string;
  ontology_fix: string;
}

interface CascadeClickThrough {
  target_view: 'bi';
  target_id: string;
  filter_field: string;
}

interface Props {
  buckets: CascadeBucket[];
  source_label: string;
  clickThrough: CascadeClickThrough;
  onNavigate: (v: View) => void;
  // Optional: fleet-level summary strip rendered above the cascade
  // (total_flagged / total / weighted gap). Kept generic so Phase 5 can
  // pass its own summary or omit entirely.
  summary?: { label: string; value: string; tone?: 'neutral' | 'accent' }[];
}

const SEVERITY_BG: Record<FlagColor, string> = {
  green: 'rgba(46,189,133,0.14)',
  yellow: 'rgba(245,200,66,0.18)',
  red: 'rgba(220,86,86,0.14)',
};
const SEVERITY_BORDER: Record<FlagColor, string> = {
  green: 'var(--c-flag-green)',
  yellow: 'var(--c-flag-yellow)',
  red: 'var(--c-flag-red)',
};
const SEVERITY_TEXT: Record<FlagColor, string> = {
  green: 'var(--c-white)',
  yellow: '#F5C542',
  red: 'var(--c-flag-red)',
};

export function CascadeFlowchart({
  buckets,
  source_label,
  clickThrough,
  onNavigate,
  summary,
}: Props) {
  const total = buckets.reduce((acc, b) => acc + b.count, 0);
  // Running residual: at each step, stores not yet classified. After the
  // last bucket, residual = 0 (the last bucket is the default catch-all,
  // e.g. OK / Standard).
  let running = total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {summary && summary.length > 0 && <Summary items={summary} />}

      <div
        style={{
          border: '1px solid var(--c-border)',
          borderRadius: 6,
          padding: 16,
          background: 'var(--c-panel)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* Source node */}
        <SourceNode label={source_label} total={total} />
        <Arrow />

        {/* Bucket nodes, separated by arrows + residual counters */}
        {buckets.map((b, i) => {
          const residualBefore = running;
          running -= b.count;
          const isLast = i === buckets.length - 1;
          return (
            <div
              key={b.key}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}
            >
              <BucketNode
                bucket={b}
                onClick={() =>
                onNavigate({
                    type: clickThrough.target_view,
                    id: clickThrough.target_id,
                    filter_field: clickThrough.filter_field,
                    filter: b.filter_value ?? b.label,
                  })
                }
              />
              {!isLast && <ResidualArrow residual={residualBefore - b.count} />}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, color: 'var(--c-gray)' }}>
        Click any bucket to filter {clickThrough.target_id.replace(/_/g, ' ')} to stores with
        that flag. Cascade is evaluated top-to-bottom, first-match-wins —
        each bucket consumes the remaining (un-matched) pool above it.
      </div>
    </div>
  );
}

// ---- Pieces -----------------------------------------------------------------

function SourceNode({ label, total }: { label: string; total: number }) {
  return (
    <div
      style={{
        padding: '10px 18px',
        border: '1px solid var(--c-border)',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.06)',
        minWidth: 280,
        textAlign: 'center',
      }}
      title={`Source total: ${total}`}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: 'var(--c-gray)',
          textTransform: 'uppercase',
        }}
      >
        Source
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-white)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function BucketNode({ bucket, onClick }: { bucket: CascadeBucket; onClick: () => void }) {
  const { label, count, severity, example_stores, criteria, description, ontology_fix } = bucket;
  const tooltip = [
    `${label} (${count})`,
    `Criteria: ${criteria}`,
    description,
    example_stores.length ? `Top: ${example_stores.slice(0, 3).join(', ')}` : null,
    ontology_fix ? `Ontology fix: ${ontology_fix}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '10px 16px',
        border: `1px solid ${SEVERITY_BORDER[severity]}`,
        borderLeft: `6px solid ${SEVERITY_BORDER[severity]}`,
        borderRadius: 6,
        background: SEVERITY_BG[severity],
        minWidth: 420,
        maxWidth: 520,
        width: '70%',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        transition: 'transform 100ms ease, box-shadow 100ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow =
          '0 2px 6px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'none';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: SEVERITY_TEXT[severity],
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--c-white)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontSize: 10,
            color: 'var(--c-gray)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          }}
        >
          {criteria}
        </span>
      </div>
      {example_stores.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--c-gray)',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--c-gray)' }}>examples:</span>
          {example_stores.slice(0, 3).map((s) => (
            <span
              key={s}
              style={{
                padding: '1px 6px',
                background: 'rgba(134,198,202,0.14)',
                border: '1px solid rgba(0,0,0,0.06)',
                borderRadius: 3,
                fontSize: 10,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {ontology_fix && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--c-teal)',
            fontStyle: 'italic',
            marginTop: 2,
          }}
        >
          fix → {ontology_fix}
        </div>
      )}
    </button>
  );
}

function Arrow() {
  return (
    <div
      style={{
        height: 14,
        display: 'flex',
        alignItems: 'center',
        color: 'var(--c-gray)',
        fontSize: 14,
      }}
    >
      ↓
    </div>
  );
}

function ResidualArrow({ residual }: { residual: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 0',
        color: 'var(--c-gray)',
        fontSize: 10,
      }}
    >
      <span>↓</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {residual.toLocaleString()} remaining
      </span>
    </div>
  );
}

function Summary({
  items,
}: {
  items: { label: string; value: string; tone?: 'neutral' | 'accent' }[];
}) {
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
            minWidth: 120,
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
