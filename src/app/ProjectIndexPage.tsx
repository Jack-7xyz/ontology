import type { CSSProperties } from 'react';
import { ontologyLogoUrl } from '../theme/tokens';
import type { ProjectManifest } from './projectManifest';

interface ProjectIndexPageProps {
  projects: ProjectManifest[];
  onOpenProject: (project: ProjectManifest) => void;
}

export function ProjectIndexPage({ projects, onOpenProject }: ProjectIndexPageProps) {
  return (
    <main className="project-index">
      <header className="project-index__header">
        <img src={ontologyLogoUrl} alt="Ontology" className="project-index__logo" />
        <div>
          <p className="project-index__eyebrow">Ontology workspace</p>
          <h1>Projects</h1>
        </div>
      </header>

      <section className="project-grid" aria-label="Available projects">
        {projects.map((project) => (
          <a
            key={project.slug}
            className="project-card"
            href={project.routeBase}
            onClick={(event) => {
              event.preventDefault();
              onOpenProject(project);
            }}
            style={{ '--project-accent': project.accentColor } as CSSProperties}
          >
            <span className="project-card__domain">{project.domain}</span>
            <h2>{project.name}</h2>
            <p>{project.summary}</p>
            <span className="project-card__status">{project.status}</span>
          </a>
        ))}
      </section>
    </main>
  );
}
