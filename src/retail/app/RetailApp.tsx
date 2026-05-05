import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Home } from '../pages/Home';
import { BiTable } from '../pages/BiTable';
import { MechanicPage } from '../pages/MechanicPage';
import { PlusTable } from '../pages/PlusTable';
import { SourceTable } from '../pages/SourceTable';
import { AskOntologyFull } from '../pages/AskOntologyFull';
import { Triggers } from '../pages/Triggers';
import { Tasks } from '../pages/Tasks';
import { readViewFromUrl, writeViewToUrl } from '../lib/urlState';
import type { LeftNavMode, RightPanelMode, View } from '../types';
import { ViewContextProvider } from '../lib/viewContext';

const NAV_KEY = 'ontology.retail.leftnav.mode';
const RIGHT_KEY = 'ontology.retail.rightpanel.mode';

function loadNavMode(): LeftNavMode {
  try {
    const saved = localStorage.getItem(NAV_KEY);
    if (saved === 'collapsed' || saved === 'expanded') return saved;
  } catch {
    // localStorage unavailable; fall through to default.
  }
  return 'expanded';
}

function loadRightMode(): RightPanelMode {
  try {
    const saved = localStorage.getItem(RIGHT_KEY);
    if (saved === 'open' || saved === 'closed') return saved;
  } catch {
    /* ignore */
  }
  return 'open';
}

export function RetailApp() {
  const [view, setViewState] = useState<View>(() => readViewFromUrl() ?? { type: 'home' });
  const [navMode, setNavMode] = useState<LeftNavMode>(loadNavMode);
  const [rightMode, setRightMode] = useState<RightPanelMode>(loadRightMode);
  const [rightPanelTab, setRightPanelTab] = useState<'context' | 'ask-ontology'>('context');

  function setView(next: View) {
    if (next.type === 'ask-ontology') {
      setRightPanelTab('ask-ontology');
    }
    // Auto-open right panel when a task or improvement is selected so the detail is visible.
    if (
      (next.type === 'tasks' && next.selectedImprovementId) ||
      (next.type === 'triggers' && next.selectedImprovementId)
    ) {
      setRightMode('open');
      try { localStorage.setItem(RIGHT_KEY, 'open'); } catch { /* ignore */ }
    }
    writeViewToUrl(next);
    setViewState(next);
  }

  // Browser back/forward: re-read the URL.
  useEffect(() => {
    function onPop() {
      setViewState(readViewFromUrl() ?? { type: 'home' });
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function toggleNav() {
    const next: LeftNavMode = navMode === 'expanded' ? 'collapsed' : 'expanded';
    setNavMode(next);
    try {
      localStorage.setItem(NAV_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function toggleRight() {
    if (view.type === 'ask-ontology') return;
    const next: RightPanelMode = rightMode === 'open' ? 'closed' : 'open';
    setRightMode(next);
    try {
      localStorage.setItem(RIGHT_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function selectRightPanelTab(next: 'context' | 'ask-ontology') {
    setRightPanelTab(next);
    if (view.type !== 'ask-ontology' && rightMode === 'closed') {
      setRightMode('open');
      try {
        localStorage.setItem(RIGHT_KEY, 'open');
      } catch {
        /* ignore */
      }
    }
  }

  const effectiveRightMode: RightPanelMode = view.type === 'ask-ontology' ? 'closed' : rightMode;

  return (
    <ViewContextProvider view={view}>
      <Layout
        view={view}
        onNavigate={setView}
        leftNavMode={navMode}
        onToggleLeftNav={toggleNav}
        rightPanelMode={effectiveRightMode}
        onToggleRightPanel={toggleRight}
        rightPanelTab={rightPanelTab}
        onSelectRightPanelTab={selectRightPanelTab}
      >
        {view.type === 'home' && <Home view={view} onNavigate={setView} />}
        {view.type === 'source' && <SourceTable key={view.table} table={view.table} />}
        {view.type === 'plus' && <PlusTable key={view.table} table={view.table} />}
        {view.type === 'ask-ontology' && <AskOntologyFull />}
        {/* `anchor` + `filter_field` + `filter` keyed into BiTable's `key` so
            re-navigating to the same BI with a different drill target remounts
            and re-triggers the scroll-to / filter-apply effects. */}
        {view.type === 'bi' && (
          <BiTable
            key={`${view.id}:${view.anchor ?? ''}:${view.filter_field ?? ''}:${view.filter ?? ''}`}
            id={view.id}
            anchor={view.anchor}
            filterField={view.filter_field}
            filter={view.filter}
          />
        )}
        {view.type === 'mech' && (
          <MechanicPage key={view.id} id={view.id} onNavigate={setView} />
        )}
        {view.type === 'triggers' && <Triggers view={view} onNavigate={setView} />}
        {view.type === 'tasks' && <Tasks view={view} onNavigate={setView} />}
      </Layout>
    </ViewContextProvider>
  );
}
