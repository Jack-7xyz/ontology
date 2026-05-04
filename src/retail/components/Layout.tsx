import type { CSSProperties, ReactNode } from 'react';
import { TopBar } from './TopBar';
import { LeftNav } from './LeftNav';
import { RightPanel } from './RightPanel';
import type { LeftNavMode, RightPanelMode, View } from '../types';

interface LayoutProps {
  children: ReactNode;
  view: View;
  onNavigate: (v: View) => void;
  leftNavMode: LeftNavMode;
  onToggleLeftNav: () => void;
  rightPanelMode: RightPanelMode;
  onToggleRightPanel: () => void;
  rightPanelTab: 'context' | 'ask-ontology';
  onSelectRightPanelTab: (tab: 'context' | 'ask-ontology') => void;
}

export function Layout({
  children,
  view,
  onNavigate,
  leftNavMode,
  onToggleLeftNav,
  rightPanelMode,
  onToggleRightPanel,
  rightPanelTab,
  onSelectRightPanelTab,
}: LayoutProps) {
  const leftW =
    leftNavMode === 'collapsed' ? 'var(--leftnav-w-collapsed)' : 'var(--leftnav-w)';
  const rightW =
    rightPanelMode === 'closed' ? 'var(--rightpanel-w-closed)' : 'var(--rightpanel-w)';
  return (
    <div className="app-shell">
      <TopBar />
      <div
        className="app-grid"
        style={{ '--left-w': leftW, '--right-w': rightW } as CSSProperties}
      >
        <aside className="app-left">
          <LeftNav
            view={view}
            onNavigate={onNavigate}
            mode={leftNavMode}
            onToggleMode={onToggleLeftNav}
          />
        </aside>
        <main
          className="app-main"
        >
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
        </main>
        <aside className="app-right">
          <RightPanel
            view={view}
            onNavigate={onNavigate}
            mode={rightPanelMode}
            onToggleMode={onToggleRightPanel}
            tab={rightPanelTab}
            onSelectTab={onSelectRightPanelTab}
          />
        </aside>
      </div>
    </div>
  );
}
