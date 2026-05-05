# Ontology Project Structure Cleanup Plan

## Summary

Make the repository presentable as an open-source Ontology workspace with one branded root project index and multiple route-isolated case-study apps under `src/{case-study}`.

The root page is a simple project directory. It lists only complete, explicitly public case studies and links into each case-study app. Case-study apps reuse shared Ontology UI/UX primitives where practical, while keeping project-specific API contracts, pages, data adapters, diagrams, and private planning notes isolated under their own folder.

## Target User Experience

- `/` is the only root homepage.
- `/` uses the same Ontology brand system as the project apps.
- `/` stays simple: project title, short description, and links to public projects.
- `/retail` opens the Retail Ontology app, landing on its ontology/DAG overview.
- Future apps use the same pattern: `/finance`, `/ecom`, `/banking`, `/agency`, and so on.
- Incomplete projects must not appear on `/` and must not be routable in public builds.

## Target Directory Shape

```text
ontology/
  src/
    main.tsx
    app/
      RootApp.tsx
      ProjectIndexPage.tsx
      projectRegistry.ts
      routing.ts
    shared/
      brand/
      shell/
      ontology/
      table/
      ask/
      routing/
      lib/
    retail/
      app/
        RetailApp.tsx
      api/
      components/
      pages/
      lineage/
      lib/
      project.manifest.ts
      _private/
        plans/
        notes/
    finance/
      app/
      project.manifest.ts
      _private/
```

Private project notes can live near the relevant project, but `src/*/_private/` must be gitignored. GCC remains root-scoped and ignored in `.GCC/`.

## Project Manifest Contract

Each case study exports an explicit manifest. Folder existence is not enough to publish a project.

```ts
export type ProjectVisibility = 'public' | 'hidden';

export interface ProjectManifest {
  slug: string;
  name: string;
  description: string;
  routeBase: `/${string}`;
  visibility: ProjectVisibility;
  loadApp: () => Promise<{ default: React.ComponentType }>;
}
```

Rules:

- `public` projects are listed on `/` and routed.
- `hidden` projects are excluded entirely from the project index and route table.
- Promoting a project is a deliberate manifest diff from `hidden` to `public`.
- The root registry should filter to public manifests before rendering routes or links.

## Routing

Move from query-encoded view state to route-isolated, readable paths.

Target retail routes:

```text
/retail
/retail/source/:table
/retail/plus/:table
/retail/bi/:id
/retail/bi/:id?anchor=...
/retail/bi/:id?filter_field=...&filter=...
/retail/mechanics/:id
/retail/mechanics/:id/improvements/:improvementId
/retail/triggers
/retail/triggers/:improvementId
/retail/tasks
/retail/tasks/:improvementId
/retail/ask
```

Implementation recommendation:

- Use a tiny local route parser first, not a routing dependency.
- Keep query params only for secondary drill-in state such as BI anchors and filters.
- Keep browser back/forward behavior working through `popstate`.
- Preserve unknown or malformed project paths by returning to the project overview or a small not-found state inside the case-study app.

## Dependency Direction

Dependency direction must stay strict.

```text
src/app      -> may import src/shared and project manifests/apps
src/{slug}   -> may import src/shared
src/shared   -> must not import from src/{slug}
```

If shared code needs project behavior, pass props, config, callbacks, or adapters from the case-study app. Shared templates must not reach into `src/retail`.

## Shared Extraction Scope

First pass is a structural extraction, not a full ontology framework rewrite.

Move stable reusable pieces toward:

```text
src/shared/brand/
  tokens.ts
  logo.ts

src/shared/shell/
  CaseStudyShell.tsx
  TopBar.tsx
  LeftNavFrame.tsx
  RightPanelFrame.tsx

src/shared/table/
  InlineTable.tsx
  FilterBar.tsx
  filter/
  lib/filters.ts
  lib/sorting.ts
  lib/formatCell.ts

src/shared/ontology/
  Lineage.tsx
  OntologyIsometric.tsx

src/shared/ask/
  AskOntologyChat.tsx
  AskOntologyDock.tsx
```

Keep project-specific pieces in `src/retail` during this pass:

- `api/client.ts`
- Retail response normalization
- Retail `types.ts`
- Retail page composition
- Retail lineage/mechanics graph metadata
- Retail mechanic diagrams
- Retail-specific nav labels, table groups, and right-panel content

The second case study should drive the next abstraction pass. Do not force a universal data contract before another project exists.

## Root Project Index

The root one-pager should be intentionally plain:

- Ontology title and short description.
- List of public project manifests.
- Each project row/card has name, one-sentence description, and an open link.
- No left sidebar or right sidebar on `/`.
- Same dark Ontology brand tokens and logo language as the apps.
- No hidden/draft placeholders.

## Downside Protection

- Add `src/*/_private/` to `.gitignore` before creating private project notes.
- Implement manifest filtering before adding placeholder project folders.
- Keep `hidden` projects out of both navigation and route registration.
- Migrate routing in one project first: Retail only.
- Avoid React Router until route complexity requires it.
- Keep the shared extraction mechanical and narrow; do not redesign page behavior while moving files.
- Maintain stable localStorage namespacing per project, for example `ontology.retail.*`.
- Preserve current retail behavior before changing visual layout.
- Use TypeScript compile errors as the first safety net after import moves.
- Run tests after each major phase, not only at the end.
- Screenshot the root index, `/retail`, representative table pages, tasks, and mobile after routing changes.

## Implementation Phases

### Phase 1 — Registry and Root Page

- Add project manifest types.
- Add `src/retail/project.manifest.ts` with `visibility: 'public'`.
- Add `src/app/projectRegistry.ts` filtering only public projects.
- Add `ProjectIndexPage` at `/`.
- Add root routing that mounts public project apps by `routeBase`.

Acceptance:

- `/` renders only public projects.
- Hidden manifests are not linked or routed.
- `/retail` still opens the existing retail experience.

### Phase 2 — Retail Route Isolation

- Move current root `App.tsx` behavior into `src/retail/app/RetailApp.tsx`.
- Replace query-encoded `?v=...` view URLs with `/retail/...` paths.
- Keep query params for BI drill-in anchors and filter state.
- Update navigation calls to write route paths instead of compact JSON state.
- Add tests for route parsing and view serialization.

Acceptance:

- Browser back/forward works.
- Existing views are reachable through clean paths.
- Malformed paths do not crash the app.

### Phase 3 — Shared Structural Extraction

- Move brand tokens and global shared assets into `src/shared/brand`.
- Move shell frames into `src/shared/shell` only where props/config make reuse clear.
- Move table/filter utilities and reusable table components into `src/shared/table`.
- Move ontology visualization components into `src/shared/ontology` when they no longer import retail-only data.
- Keep retail page composition and API details inside `src/retail`.

Acceptance:

- `src/shared` has zero imports from `src/retail`.
- Retail pages import shared primitives instead of duplicated root-level code.
- No behavior regressions in representative retail views.

### Phase 4 — Private Project Workspace Hygiene

- Add `src/*/_private/` to `.gitignore`.
- Optionally create local ignored `_private/plans` folders for active project planning.
- Keep root `.GCC/` as the active branch/session tracker.

Acceptance:

- Private planning files are ignored.
- Public repo contains no private project notes.

## Verification

Run after implementation:

```bash
npm run build
npm run lint
npm test
```

Manual/browser checks:

- `/` root project index.
- `/retail` overview.
- `/retail/source/<known-table>`.
- `/retail/plus/<known-table>`.
- `/retail/bi/<known-dashboard>`.
- `/retail/tasks`.
- `/retail/ask`.
- Mobile viewport for `/` and `/retail`.

Repository checks:

- Confirm hidden project manifests are not routable.
- Confirm `src/shared` does not import from `src/retail`.
- Confirm private folders under `src/*/_private/` are ignored.
