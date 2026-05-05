import type { ComponentType } from 'react';

export type ProjectVisibility = 'public' | 'hidden';

export interface ProjectManifest {
  slug: string;
  name: string;
  routeBase: `/${string}`;
  domain: string;
  summary: string;
  status: string;
  visibility: ProjectVisibility;
  accentColor: string;
  App: ComponentType;
}
