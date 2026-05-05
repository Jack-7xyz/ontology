import type { ProjectManifest } from './projectManifest';
import { retailProjectManifest } from '../retail/project.manifest';

const manifests: ProjectManifest[] = [
  retailProjectManifest,
];

export function getPublicProjects(): ProjectManifest[] {
  return manifests.filter((project) => project.visibility === 'public');
}

export function matchPublicProjectRoute(pathname: string): ProjectManifest | null {
  return getPublicProjects().find((project) => (
    pathname === project.routeBase || pathname.startsWith(`${project.routeBase}/`)
  )) ?? null;
}
