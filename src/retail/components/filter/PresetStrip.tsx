import type { FilterPreset } from '../../lib/filters';

interface Props {
  preset: FilterPreset | null;
  hasDiverged: boolean;
}

export function PresetStrip({ preset, hasDiverged }: Props) {
  if (!preset) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: 'rgba(134,198,202,0.14)',
        border: '1px solid var(--c-border)',
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          letterSpacing: 0.4,
          color: 'var(--c-teal)',
        }}
      >
        PRESET
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          borderRadius: 999,
          background: 'var(--c-panel)',
          border: '1px solid #BFE3D5',
          color: 'var(--c-white)',
          fontWeight: 600,
        }}
      >
        {preset.label}
      </span>
      <span style={{ color: 'var(--c-gray)' }}>
        {hasDiverged ? 'Edited from preset baseline' : 'Preset baseline active'}
      </span>
    </div>
  );
}
