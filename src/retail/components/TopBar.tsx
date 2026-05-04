import { ontologyLogoUrl } from '../../theme/tokens';

export function TopBar() {
  return (
    <header
      className="topbar"
      style={{
        height: 'var(--topbar-h)',
        background: 'var(--c-dark)',
        color: 'var(--c-white)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        borderBottom: '3px solid var(--c-teal)',
        gap: 14,
      }}
    >
      <img
        src={ontologyLogoUrl}
        alt="Ontology"
        style={{ height: 30, width: 'auto' }}
      />
      <span className="topbar-title" style={{ fontWeight: 600, fontSize: 15, letterSpacing: 0.2 }}>
        Retail Ontology
      </span>
    </header>
  );
}
