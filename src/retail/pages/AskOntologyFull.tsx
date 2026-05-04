import { AskOntologyChat } from '../components/AskOntologyChat';

export function AskOntologyFull() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flex: 1,
        minHeight: 0,
        maxWidth: 1200,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: 'var(--c-white)' }}>
          Ask Ontology
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--c-gray)', fontSize: 13 }}>
          Cross-app copilot. Ask narrative questions or render one table inline per turn.
        </p>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <AskOntologyChat
          viewType="global"
          viewId="all"
          variant="full"
          enableRenderTable={true}
          label="Ask Ontology"
        />
      </div>
    </div>
  );
}
