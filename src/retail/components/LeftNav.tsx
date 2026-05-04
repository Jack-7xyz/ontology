// Persistent left nav. Source tables come from /api/snapshot/info.
// Two modes (expanded | collapsed). Collapsed = icon + first-letter rail only.
// Each group (Plus / Source / BI / Mechanics / Utility) collapses independently —
// state persisted in localStorage['ontology.retail.leftnav.groups'].

import { useEffect, useState, type ReactNode } from 'react';
import { api, type BiInfo, type PlusInfo, type SnapshotInfo } from '../api/client';
import { MECHANICS } from '../lineage/graph';
import type { LeftNavMode, View } from '../types';

const GROUPS_KEY = 'ontology.retail.leftnav.groups';
type GroupId = 'plus' | 'source' | 'bi' | 'mechanics' | 'utility';
type GroupState = Record<GroupId, boolean>;
const DEFAULT_GROUPS: GroupState = {
  plus: true,
  source: true,
  bi: true,
  mechanics: true,
  utility: true,
};

function loadGroups(): GroupState {
  try {
    const saved = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULT_GROUPS, ...saved };
  } catch {
    /* ignore */
  }
  return DEFAULT_GROUPS;
}

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  mode: LeftNavMode;
  onToggleMode: () => void;
}

// Display-friendly rename: snake_case → Title Case (strip trailing _data).
function prettyName(tbl: string): string {
  const base = tbl.replace(/_data$/, '');
  return base
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function initials(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Inline SVG per section — stroke=currentColor so they inherit the
// existing var(--c-gray) label color. Kept in this file (only 5 glyphs;
// not worth a separate icon module or dependency).
function SectionIcon({ id, size = 16 }: { id: GroupId; size?: number }) {
  const sw = 1.5;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: sw,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'source':
      // Database cylinder — 3 discs
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5" rx="7" ry="2.5" />
          <path d="M5 5v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5" />
          <path d="M5 12v7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-7" />
        </svg>
      );
    case 'plus':
      // Stacked layers
      return (
        <svg {...common}>
          <path d="M12 3 3 8l9 5 9-5-9-5Z" />
          <path d="m3 13 9 5 9-5" />
          <path d="m3 18 9 5 9-5" />
        </svg>
      );
    case 'bi':
      // Bar chart — 3 bars rising
      return (
        <svg {...common}>
          <path d="M3 21h18" />
          <rect x="5" y="13" width="3.5" height="8" />
          <rect x="10.25" y="9" width="3.5" height="12" />
          <rect x="15.5" y="5" width="3.5" height="16" />
        </svg>
      );
    case 'mechanics':
      // Gear
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );
    case 'utility':
      // 4-point sparkle (AI/NL tools)
      return (
        <svg {...common}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
          <path d="M12 9c0 1.5 1.5 3 3 3-1.5 0-3 1.5-3 3 0-1.5-1.5-3-3-3 1.5 0 3-1.5 3-3Z" />
        </svg>
      );
  }
}

export function LeftNav({ view, onNavigate, mode, onToggleMode }: Props) {
  const [info, setInfo] = useState<SnapshotInfo | null>(null);
  const [plus, setPlus] = useState<PlusInfo | null>(null);
  const [biData, setBiData] = useState<BiInfo | null>(null);
  const [backendOffline, setBackendOffline] = useState(false);
  const [groups, setGroups] = useState<GroupState>(loadGroups);
  const collapsed = mode === 'collapsed';

  useEffect(() => {
    api
      .snapshotInfo()
      .then(setInfo)
      .catch(() => setBackendOffline(true));
    api
      .plusInfo()
      .then(setPlus)
      .catch(() => setBackendOffline(true));
    api
      .biInfo()
      .then(setBiData)
      .catch(() => setBackendOffline(true));
  }, []);

  function persistGroups(next: GroupState) {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function toggleGroup(g: GroupId) {
    setGroups((prev) => {
      const next = { ...prev, [g]: !prev[g] };
      persistGroups(next);
      return next;
    });
  }

  // Click on a rail icon: expand the nav and open ONLY that section.
  function handleRailIconClick(g: GroupId) {
    const next: GroupState = {
      plus: false,
      source: false,
      bi: false,
      mechanics: false,
      utility: false,
      [g]: true,
    };
    setGroups(next);
    persistGroups(next);
    onToggleMode();
  }

  // Re-collapsing the nav resets section state to defaults so the next
  // rail-icon drill-in starts clean.
  function handleToggleMode() {
    if (!collapsed) {
      setGroups(DEFAULT_GROUPS);
      persistGroups(DEFAULT_GROUPS);
    }
    onToggleMode();
  }

  const isHome = view.type === 'home';

  return (
    <nav
      style={{
        background: 'var(--c-panel)',
        borderRight: '1px solid var(--c-border)',
        color: 'var(--c-white)',
        padding: '10px 0',
        overflow: 'auto',
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        onClick={handleToggleMode}
        title={collapsed ? 'Expand nav' : 'Collapse nav'}
        style={{
          alignSelf: collapsed ? 'center' : 'flex-end',
          margin: collapsed ? '0 0 6px' : '0 10px 6px',
          background: 'transparent',
          border: '1px solid var(--c-border)',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 12,
          color: 'var(--c-muted)',
          cursor: 'pointer',
        }}
      >
        {collapsed ? '»' : '« collapse'}
      </button>

      <NavItem
        collapsed={collapsed}
        active={isHome}
        label="Home"
        icon="⌂"
        onClick={() => onNavigate({ type: 'home' })}
      />

      <Group id="plus" label="Plus Tables (staging)" open={groups.plus} onToggle={toggleGroup} onRailIconClick={handleRailIconClick} collapsed={collapsed}>
        {!plus && backendOffline && (
          <BackendOfflineNote />
        )}
        {!plus && !backendOffline && (
          <div style={{ padding: '4px 16px', color: 'var(--c-gray)' }}>loading…</div>
        )}
        {plus &&
          plus.tables.map((pid) => (
            <NavItem
              key={`p-${pid}`}
              collapsed={collapsed}
              active={view.type === 'plus' && view.table === pid}
              label={plus.meta[pid].label}
              onClick={() => onNavigate({ type: 'plus', table: pid })}
              tier="tab"
            />
          ))}
      </Group>

      <Group id="source" label="Source Tables (raw)" open={groups.source} onToggle={toggleGroup} onRailIconClick={handleRailIconClick} collapsed={collapsed}>
        {!info && backendOffline && (
          <BackendOfflineNote />
        )}
        {!info && !backendOffline && (
          <div style={{ padding: '4px 16px', color: 'var(--c-gray)' }}>loading…</div>
        )}
        {info &&
          info.tables.map((t) => (
            <NavItem
              key={t}
              collapsed={collapsed}
              active={view.type === 'source' && view.table === t}
              label={prettyName(t)}
              right={`${info.rows_per[t].toLocaleString()}`}
              onClick={() => onNavigate({ type: 'source', table: t })}
              tier="raw"
            />
          ))}
      </Group>

      <Group id="bi" label="BI Dashboards" open={groups.bi} onToggle={toggleGroup} onRailIconClick={handleRailIconClick} collapsed={collapsed}>
        {!biData && backendOffline && (
          <BackendOfflineNote />
        )}
        {!biData && !backendOffline && (
          <div style={{ padding: '4px 16px', color: 'var(--c-gray)' }}>loading…</div>
        )}
        {biData &&
          biData.dashboards.map((bid) => (
            <NavItem
              key={`bi-${bid}`}
              collapsed={collapsed}
              active={view.type === 'bi' && view.id === bid}
              label={biData.meta[bid].label}
              onClick={() => onNavigate({ type: 'bi', id: bid })}
              tier="bi"
            />
          ))}
      </Group>

      <Group id="mechanics" label="Mechanics" open={groups.mechanics} onToggle={toggleGroup} onRailIconClick={handleRailIconClick} collapsed={collapsed}>
        {/* Mechanics with shipped backends are clickable; un-shipped phases
            stay disabled. `view.type === 'mech'` highlights the active page. */}
        {MECHANICS.map((m) => {
          // All 6 mechanics shipped across Phases 1-6 — backend REGISTRY at
          // mechanics/__init__.py is the source of truth. Every entry in
          // MECHANICS now has a corresponding compute() + META, so every
          // LeftNav row is clickable.
          const enabled =
            m.id === 'red_count' ||
            m.id === 'rev_decomp' ||
            m.id === 'attr_gap' ||
            m.id === 'hg_processor' ||
            m.id === 'perf_flag_cascade' ||
            m.id === 'fine_rev';
          return (
            <NavItem
              key={`mech-${m.id}`}
              collapsed={collapsed}
              active={view.type === 'mech' && view.id === m.id}
              disabled={!enabled}
              label={m.label}
              icon="⚙"
              onClick={enabled ? () => onNavigate({ type: 'mech', id: m.id }) : undefined}
            />
          );
        })}
      </Group>

      <Group id="utility" label="Utility" open={groups.utility} onToggle={toggleGroup} onRailIconClick={handleRailIconClick} collapsed={collapsed}>
        <NavItem
          collapsed={collapsed}
          active={view.type === 'ask-ontology'}
          label="Ask Ontology"
          icon="✦"
          onClick={() => onNavigate({ type: 'ask-ontology' })}
        />
        <NavItem
          collapsed={collapsed}
          label="2-Week Notice Trigger"
          icon="◐"
          active={view.type === 'triggers'}
          onClick={() => onNavigate({ type: 'triggers' })}
        />
        <NavItem
          collapsed={collapsed}
          label="Next Steps"
          icon="◈"
          active={view.type === 'tasks'}
          onClick={() => onNavigate({ type: 'tasks' })}
        />
      </Group>
    </nav>
  );
}

function BackendOfflineNote() {
  return (
    <div
      style={{
        margin: '4px 16px 8px',
        padding: '7px 8px',
        borderRadius: 6,
        border: '1px solid var(--c-border)',
        background: 'var(--c-panel-2)',
        color: 'var(--c-muted)',
        fontSize: 11,
        lineHeight: 1.35,
      }}
    >
      Backend offline
    </div>
  );
}

function Group({
  id,
  label,
  open,
  onToggle,
  onRailIconClick,
  collapsed,
  children,
}: {
  id: GroupId;
  label: string;
  open: boolean;
  onToggle: (g: GroupId) => void;
  onRailIconClick: (g: GroupId) => void;
  collapsed: boolean;
  children: ReactNode;
}) {
  // In icon-rail mode we render the static SectionHeader ONLY — no children.
  // The rail is a tight vertical stack of 5 section icons; clicking an icon
  // expands the nav and opens that section.
  if (collapsed) {
    return (
      <SectionHeader
        collapsed={collapsed}
        id={id}
        label={label}
        onClick={() => onRailIconClick(id)}
      />
    );
  }
  return (
    <>
      <button
        onClick={() => onToggle(id)}
        title={open ? 'Collapse section' : 'Expand section'}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 6px',
          color: 'var(--c-gray)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SectionIcon id={id} size={14} />
          <span>{label}</span>
        </span>
        <span
          style={{
            fontSize: 10,
            opacity: 0.7,
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        >
          ▶
        </span>
      </button>
      {open && children}
    </>
  );
}

function SectionHeader({
  id,
  label,
  collapsed,
  onClick,
}: {
  id: GroupId;
  label: string;
  collapsed: boolean;
  onClick?: () => void;
}) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Open ${label}`}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '10px 0 6px',
          display: 'flex',
          justifyContent: 'center',
          color: 'var(--c-gray)',
          borderTop: '1px solid var(--c-border)',
          margin: '6px 10px 0',
        }}
      >
        <SectionIcon id={id} size={20} />
      </button>
    );
  }
  return (
    <div
      style={{
        padding: '16px 16px 6px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--c-gray)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <SectionIcon id={id} size={14} />
      <span>{label}</span>
    </div>
  );
}

function NavItem({
  label,
  onClick,
  active,
  right,
  disabled,
  tier,
  collapsed,
  icon,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  right?: string;
  disabled?: boolean;
  tier?: 'raw' | 'tab' | 'bi';
  collapsed: boolean;
  icon?: string;
}) {
  const tierDot =
    tier === 'raw'
      ? 'var(--c-tier-raw)'
      : tier === 'tab'
        ? 'var(--c-tier-tab-derived)'
        : tier === 'bi'
          ? 'var(--c-tier-bi-derived)'
          : undefined;

  if (collapsed) {
    return (
      <div
        onClick={disabled ? undefined : onClick}
        title={label + (right ? ` · ${right}` : '')}
        style={{
          padding: '8px 0',
          margin: '1px 6px',
          textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer',
          background: active ? 'var(--c-panel-3)' : 'transparent',
          color: disabled ? 'var(--c-gray)' : 'var(--c-white)',
          borderRadius: 4,
          borderLeft: active ? '3px solid var(--c-purple)' : '3px solid transparent',
          fontWeight: active ? 700 : 500,
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {tierDot && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: tierDot,
              border: '1px solid var(--c-border)',
            }}
          />
        )}
        <span>{icon ?? initials(label)}</span>
      </div>
    );
  }

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '7px 16px',
        cursor: disabled ? 'default' : 'pointer',
        background: active ? 'var(--c-panel-3)' : 'transparent',
        color: disabled ? 'var(--c-gray)' : 'var(--c-white)',
        borderLeft: active ? '3px solid var(--c-purple)' : '3px solid transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tierDot && (
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: 2,
              background: tierDot,
              border: '1px solid var(--c-border)',
            }}
          />
        )}
        {label}
      </span>
      {right && <span style={{ color: 'var(--c-gray)', fontSize: 11 }}>{right}</span>}
    </div>
  );
}
