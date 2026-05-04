// 5-tier ontology — isometric cube stack + Utility sphere on top.
// Rendered as a single SVG: 4 chunky 3-face cubes stacked bottom→top, a
// radial-gradient sphere capping the stack, a DATA FLOW rail on the left,
// and horizontal leader lines terminating in right-hand labels.

import type { TierKey } from '../types';

interface Props {
  selected?: TierKey;
  onSelect: (tier: TierKey) => void;
}

// ── Iso projection (30°/30° axes). ─────────────────────────────────────
// +x → right-down, +y → left-down, +z → up.
const C30 = Math.cos(Math.PI / 6); // 0.866
const S30 = Math.sin(Math.PI / 6); // 0.5

function proj(ox: number, oy: number, x: number, y: number, z: number): [number, number] {
  return [ox + x * C30 - y * C30, oy + x * S30 + y * S30 - z];
}

// ── Tier palette ──────────────────────────────────────────────────────
// Top face = lightest, left face (+y) = medium, right face (+x) = darker.
// Approximates a light source in the upper-left.
interface CubeDef {
  key: TierKey;
  label: string;
  subline: string;
  top: string;
  left: string;
  right: string;
}

// Draw order: bottom → top (painter's algorithm for stack occlusion).
const CUBES_BOTTOM_UP: CubeDef[] = [
  { key: 'source',    label: 'Source',        subline: '10 raw sheets from xlsx snapshot',       top: '#17456A', left: '#11334F', right: '#0B2438' },
  { key: 'plus',      label: 'Plus Tables',   subline: 'Source + derived metrics',               top: '#2A638B', left: '#17456A', right: '#102F49' },
  { key: 'bi',        label: 'BI Dashboards', subline: 'Visualize & Explore',                    top: '#86C6CA', left: '#4E999F', right: '#286C73' },
  { key: 'mechanics', label: 'Mechanics',     subline: 'Alerts · Enrichments · Accountability',  top: '#B7E4E6', left: '#86C6CA', right: '#4E999F' },
];

const UTILITY = {
  key: 'utility' as TierKey,
  label: 'Utility',
  subline: 'Ask Ontology · Triggers · Actions',
};

// ── Layout constants ──────────────────────────────────────────────────
const W = 760;
const H = 560;
const CX = 310;          // cube centre x
const BASE_Y = 470;      // bottom-most cube centre y
const SIDE = 180;        // cube side length in 3D units
const THICK = 28;        // cube vertical thickness
const GAP = 54;          // screen-y offset between adjacent cubes
const SPHERE_R = 52;
const SPHERE_GAP = 80;   // distance from top-cube centre → sphere centre
const LABEL_X = 550;

export function OntologyIsometric({ selected, onSelect }: Props) {
  const topCubeY = BASE_Y - (CUBES_BOTTOM_UP.length - 1) * GAP;
  const sphereY = topCubeY - SPHERE_GAP;

  // Leader-line rows, top → bottom (sphere first).
  const rows: { key: TierKey; label: string; subline: string; anchor: [number, number] }[] = [
    {
      key: UTILITY.key,
      label: UTILITY.label,
      subline: UTILITY.subline,
      anchor: [CX + SPHERE_R, sphereY],
    },
    ...CUBES_BOTTOM_UP.slice()
      .reverse()
      .map((c) => {
        const i = CUBES_BOTTOM_UP.indexOf(c);
        const oy = BASE_Y - i * GAP;
        return {
          key: c.key,
          label: c.label,
          subline: c.subline,
          anchor: proj(CX, oy, SIDE / 2, -SIDE / 2, THICK / 2),
        };
      }),
  ];

  return (
    <div
      style={{
        flex: 1,
        background: 'var(--c-panel-2)',
        border: '1px solid var(--c-border)',
        borderRadius: 10,
        padding: 18,
        minHeight: H + 20,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          color: 'var(--c-gray)',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginBottom: 4,
        }}
      >
        Ontology — click a tier to inspect in the right panel
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, alignSelf: 'center', flex: 1 }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="ont-sphere-fill" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ECFCF2" />
            <stop offset="45%" stopColor="#86C6CA" />
            <stop offset="100%" stopColor="#17456A" />
          </radialGradient>
          <radialGradient id="ont-sphere-highlight" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id="ont-flow" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#17456A" />
            <stop offset="100%" stopColor="#82E2C8" />
          </linearGradient>
          <filter id="ont-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="4" dy="10" stdDeviation="6" floodColor="#1A1A2E" floodOpacity="0.22" />
          </filter>
          <filter id="ont-soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#1A1A2E" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* DATA FLOW rail (left) */}
        <rect x="0" y="0" width={W} height={H} rx="8" fill="#171A1C" />

        <g transform="translate(50, 70)">
          <text x="0" y="0" fontSize="10" fontWeight={700} letterSpacing={3} fill="#A7B0B4">
            DATA
          </text>
          <text x="0" y="14" fontSize="10" fontWeight={700} letterSpacing={3} fill="#A7B0B4">
            FLOW
          </text>
          <line
            x1="14"
            y1="40"
            x2="14"
            y2={BASE_Y - 80}
            stroke="url(#ont-flow)"
            strokeWidth={2}
          />
          <polygon points="14,28 9,40 19,40" fill="#82E2C8" />
        </g>

        {/* Cubes (bottom → top) */}
        {CUBES_BOTTOM_UP.map((c, i) => (
          <Cube
            key={c.key}
            ox={CX}
            oy={BASE_Y - i * GAP}
            side={SIDE}
            thick={THICK}
            def={c}
            active={selected === c.key}
            onClick={() => onSelect(c.key)}
          />
        ))}

        {/* Utility sphere — capstone */}
        <g
          onClick={() => onSelect('utility')}
          style={{ cursor: 'pointer' }}
        >
          {/* Ground shadow under sphere */}
          <ellipse
            cx={CX + 6}
            cy={sphereY + SPHERE_R + 10}
            rx={SPHERE_R * 0.9}
            ry={SPHERE_R * 0.18}
            fill="rgba(26,26,46,0.2)"
          />
          <circle
            cx={CX}
            cy={sphereY}
            r={SPHERE_R}
            fill="url(#ont-sphere-fill)"
            stroke={selected === 'utility' ? '#86C6CA' : 'none'}
            strokeWidth={selected === 'utility' ? 3 : 0}
            filter="url(#ont-soft-shadow)"
          />
          <ellipse
            cx={CX - SPHERE_R * 0.28}
            cy={sphereY - SPHERE_R * 0.38}
            rx={SPHERE_R * 0.36}
            ry={SPHERE_R * 0.22}
            fill="url(#ont-sphere-highlight)"
            pointerEvents="none"
          />
        </g>

        {/* Leader lines + right-side labels */}
        {rows.map((row) => {
          const isActive = selected === row.key;
          const [ax, ay] = row.anchor;
          return (
            <g
              key={row.key}
              onClick={() => onSelect(row.key)}
              style={{ cursor: 'pointer' }}
            >
              <line
                x1={ax + 4}
                y1={ay}
                x2={LABEL_X - 10}
                y2={ay}
            stroke={isActive ? '#86C6CA' : '#3E4A50'}
                strokeWidth={isActive ? 1.5 : 1}
              />
              <circle
                cx={LABEL_X - 6}
                cy={ay}
                r={2.5}
                fill={isActive ? '#86C6CA' : '#A7B0B4'}
              />
              <text
                x={LABEL_X}
                y={ay + 5}
                fontSize={13}
                fontWeight={700}
                fill={isActive ? '#86C6CA' : '#FFFFFF'}
                letterSpacing={1.2}
              >
                {row.label.toUpperCase()}
              </text>
              <text x={LABEL_X} y={ay + 22} fontSize={11} fill="#A7B0B4">
                {row.subline}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Cube({
  ox,
  oy,
  side,
  thick,
  def,
  active,
  onClick,
}: {
  ox: number;
  oy: number;
  side: number;
  thick: number;
  def: CubeDef;
  active: boolean;
  onClick: () => void;
}) {
  const v = (sx: number, sy: number, sz: number): [number, number] =>
    proj(ox, oy, (sx * side) / 2, (sy * side) / 2, (sz * thick) / 2);

  // +z top face
  const top: [number, number][] = [v(-1, -1, +1), v(+1, -1, +1), v(+1, +1, +1), v(-1, +1, +1)];
  // +x right-front face
  const right: [number, number][] = [v(+1, -1, +1), v(+1, +1, +1), v(+1, +1, -1), v(+1, -1, -1)];
  // +y left-front face
  const left: [number, number][] = [v(-1, +1, +1), v(+1, +1, +1), v(+1, +1, -1), v(-1, +1, -1)];

  const pts = (arr: [number, number][]) => arr.map(([x, y]) => `${x},${y}`).join(' ');

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }} filter="url(#ont-shadow)">
      <polygon points={pts(right)} fill={def.right} />
      <polygon points={pts(left)} fill={def.left} />
      <polygon
        points={pts(top)}
        fill={def.top}
        stroke={active ? '#86C6CA' : 'rgba(134,198,202,0.16)'}
        strokeWidth={active ? 3 : 0.5}
        strokeLinejoin="round"
      />
    </g>
  );
}
