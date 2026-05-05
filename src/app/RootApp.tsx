import { useEffect, useState } from 'react';
import { ProjectIndexPage } from './ProjectIndexPage';
import type { ProjectManifest } from './projectManifest';
import { getPublicProjects, matchPublicProjectRoute } from './projectRegistry';

function readPathname(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

function NotFoundPage() {
  return (
    <main className="project-index project-index--not-found">
      <p className="project-index__eyebrow">Unknown route</p>
      <h1>Project not found</h1>
      <a className="project-index__home-link" href="/">Back to projects</a>
    </main>
  );
}

export function RootApp() {
  const [pathname, setPathname] = useState(readPathname);
  const projects = getPublicProjects();
  const project = matchPublicProjectRoute(pathname);

  useEffect(() => {
    function handlePopState() {
      setPathname(readPathname());
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function openProject(nextProject: ProjectManifest) {
    window.history.pushState(null, '', nextProject.routeBase);
    setPathname(nextProject.routeBase);
  }

  if (pathname === '/') {
    return <ProjectIndexPage projects={projects} onOpenProject={openProject} />;
  }

  if (project) {
    const ProjectApp = project.App;
    return <ProjectApp />;
  }

  return <NotFoundPage />;
}
