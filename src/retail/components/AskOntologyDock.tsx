import { useViewContext } from '../lib/viewContext';
import { AskOntologyChat } from './AskOntologyChat';

export function AskOntologyDock() {
  const { viewType, viewId, viewKey, label } = useViewContext();

  if (!viewType || !viewId) {
    return (
      <AskOntologyChat
        viewType="global"
        viewId="all"
        variant="dock"
        label="Ask Ontology"
      />
    );
  }

  return (
    <AskOntologyChat
      viewType={viewType}
      viewId={viewId}
      cacheKey={viewKey ?? undefined}
      variant="dock"
      label={label}
    />
  );
}
