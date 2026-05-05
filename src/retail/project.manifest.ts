import type { ProjectManifest } from '../app/projectManifest';
import { RetailApp } from './app/RetailApp';

export const retailProjectManifest: ProjectManifest = {
  slug: 'retail',
  name: 'Retail Ontology',
  routeBase: '/retail',
  domain: 'Retail operations',
  summary: 'Source, staging, BI, mechanics, tasks, and assistant workflows for a retail case study.',
  status: 'Active case study',
  visibility: 'public',
  accentColor: '#86C6CA',
  App: RetailApp,
};
