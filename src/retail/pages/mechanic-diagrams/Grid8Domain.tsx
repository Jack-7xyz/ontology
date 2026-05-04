// Grid8Domain — Red Count diagram. 8-column × N-row matrix, sorted by RC desc.
// Each cell is a G/Y/R chip per (store, domain). Hover row → tooltip with RC,
// store name, and per-domain breakdown. Click row → drill to Store Intelligence
// scrolled to (and briefly highlighted on) the matching store.
//
// Reuses the same FLAG_COLOR mapping + chip dimensions as BiTable so the
// visual idiom is consistent across BI tables and mechanic diagrams.

import type { FlagColor, View } from '../../types';

interface GridCell {
  [domain: string]: FlagColor | null;
}

interface GridRow {
  store: string;
  red_count: number;
  red_domains: string;
  gross_sales: number | null;
  cells: GridCell;
}

interface Props {
  rows: GridRow[];
  columns: string[]; // 8 domain headers — Return, Attr Gap, Payroll, Visual, VOC, Cash, HG, Inventory
  distribution: Record<string, number>; // {"0": 38, "1": 47, "2": 29, "3+": 6}
  clickThrough: { target_view: 'bi'; target_id: string; anchor_field: string };
  onNavigate: (v: View) => void;
}

const FLAG_COLOR: Record<FlagColor, string> = {
  green: 'var(--c-flag-green)',
  yellow: 'var(--c-flag-yellow)',
  red: 'var(--c-flag-red)',
};

const RC_BG: Record<string, string> = {
  green: 'rgba(46,189,133,0.10)',   // RC=0
  yellow: 'rgba(245,200,66,0.12)',  // RC=1-2
  red: 'rgba(220,86,86,0.12)',      // RC≥3
};

function rcBand(rc: number): 'green' | 'yellow' | 'red' {
  if (rc === 0) return 'green';
  if (rc <= 2) return 'yellow';
  return 'red';
}

function fmtMoney(v: number | null): string {
  if (v === null || v === undefined) return '';
  return v.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function Grid8Domain({ rows, columns, distribution, clickThrough, onNavigate }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Distribution band — mirrors deck s_m1_insights bullet 1 */}
      <DistributionBand distribution={distribution} total={rows.length} />

      {/* Grid */}
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
              <th
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderBottom: '2px solid var(--c-border)',
                  position: 'sticky',
                  left: 0,
                  background: 'var(--c-tier-bi-derived)',
                  minWidth: 180,
                  zIndex: 2,
                }}
              >
                Store
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 10px',
                  borderBottom: '2px solid var(--c-border)',
                  width: 56,
                }}
                title="Red Count: number of domains in red (of 8). Green=0 · Yellow=1-2 · Red≥3"
              >
                RC
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  style={{
                    textAlign: 'center',
                    padding: '8px 10px',
                    borderBottom: '2px solid var(--c-border)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c}
                </th>
              ))}
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 10px',
                  borderBottom: '2px solid var(--c-border)',
                  whiteSpace: 'nowrap',
                }}
              >
                Gross
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const band = rcBand(r.red_count);
              const tooltip = `${r.store} · RC=${r.red_count}${r.red_domains ? ` · ${r.red_domains}` : ''}`;
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
                    background: RC_BG[band],
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(23,69,106,0.32)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background = RC_BG[band];
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
                  <td
                    style={{
                      padding: '6px 10px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 700,
                      color:
                        band === 'red'
                          ? 'var(--c-flag-red)'
                          : band === 'yellow'
                          ? '#F5C542'
                          : 'var(--c-gray)',
                    }}
                  >
                    {r.red_count}
                  </td>
                  {columns.map((c) => {
                    const color = r.cells[c];
                    return (
                      <td
                        key={c}
                        style={{ padding: '6px 10px', textAlign: 'center' }}
                        title={color ? `${c}: ${color}` : `${c}: no flag`}
                      >
                        {color ? (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 12,
                              height: 12,
                              borderRadius: 3,
                              background: FLAG_COLOR[color],
                              boxShadow: '0 0 0 0.5px rgba(0,0,0,0.25) inset',
                            }}
                          />
                        ) : (
                          <span style={{ color: 'var(--c-gray)', fontSize: 10 }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      padding: '6px 10px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--c-gray)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtMoney(r.gross_sales)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer hint */}
      <div style={{ fontSize: 11, color: 'var(--c-gray)' }}>
        Click any row to open Store Intelligence anchored on that store. Sort: Red Count desc, then Gross desc.
      </div>
    </div>
  );
}

function DistributionBand({
  distribution,
  total,
}: {
  distribution: Record<string, number>;
  total: number;
}) {
  const items = [
    { key: '0', label: 'RC = 0', color: 'var(--c-flag-green)', count: distribution['0'] ?? 0 },
    { key: '1', label: 'RC = 1', color: 'rgba(245,200,66,0.65)', count: distribution['1'] ?? 0 },
    { key: '2', label: 'RC = 2', color: 'var(--c-flag-yellow)', count: distribution['2'] ?? 0 },
    { key: '3+', label: 'RC ≥ 3', color: 'var(--c-flag-red)', count: distribution['3+'] ?? 0 },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'stretch',
        fontSize: 11,
        color: 'var(--c-gray)',
      }}
    >
      <span style={{ alignSelf: 'center', fontWeight: 700, letterSpacing: 0.4 }}>DISTRIBUTION</span>
      {items.map((it) => {
        const pct = total ? Math.round((it.count / total) * 100) : 0;
        return (
          <div
            key={it.key}
            style={{
              flex: it.count || 1,
              minWidth: 80,
              padding: '6px 10px',
              border: '1px solid var(--c-border)',
              borderLeft: `4px solid ${it.color}`,
              borderRadius: 4,
              background: 'var(--c-panel)',
            }}
            title={`${it.count} of ${total} stores`}
          >
            <div style={{ fontWeight: 700, color: 'var(--c-white)' }}>
              {it.label}: {it.count}
            </div>
            <div style={{ fontSize: 10 }}>{pct}% of fleet</div>
          </div>
        );
      })}
    </div>
  );
}
