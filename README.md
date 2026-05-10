# Ontology

[![Live Demo](https://img.shields.io/badge/live-ontology--smoky.vercel.app-86C6CA?style=flat-square)](https://ontology-smoky.vercel.app)
[![React](https://img.shields.io/badge/React-19-2b2b2b?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-2b2b2b?style=flat-square&logo=vite&logoColor=646CFF)](https://vite.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-2b2b2b?style=flat-square&logo=fastapi&logoColor=009688)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-2b2b2b?style=flat-square&logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/)

Ontology is a public workspace for operational ontology case studies: source data, staging transforms, BI surfaces, diagnostic mechanics, task backlogs, and assistant workflows in one explorable web app.

The first published case study is **Retail Ontology**, a 120-store retail operations example with 10 source sheets, a 5-layer ontology rebuild, lineage navigation, computed dashboards, and drill-down mechanics.

**Explore it:** [ontology-smoky.vercel.app](https://ontology-smoky.vercel.app)

## What This Shows

Most analytics demos stop at dashboards. Ontology is built around the next layer: how raw operating data becomes structured judgment, action queues, and explainable diagnostics.

| Layer | In the app | Why it matters |
|:--|:--|:--|
| Source | Raw imported tables from the retail snapshot | Keeps the original grain visible. |
| Plus | Staging tables with formulas, descriptions, and derived columns | Shows how raw fields become analysis-ready entities. |
| BI | Store, operations, associate, attribution, fine mix, and HG dashboards | Turns the ontology into decision surfaces. |
| Mechanics | Red Count, revenue decomposition, attribution gap, performance flags, and more | Converts dashboards into diagnostic stories and drill paths. |
| Utility | Ask Ontology, trigger views, and task catalog | Connects analysis to action and follow-up work. |

## Features

- **Public project index** at `/`, designed to host multiple future ontology case studies.
- **Retail case study** at `/retail` with route-isolated views for source, Plus, BI, mechanics, triggers, tasks, and Ask Ontology.
- **Ontology and lineage views** that let guests switch between a tiered 5-layer map and a source-to-mechanic dependency graph.
- **Typed table exploration** with pagination, filters, sorting, formulas, column descriptions, and semantic cell coloring.
- **Computed backend surfaces** powered by FastAPI and a bundled SQLite snapshot.
- **Diagnostic mechanics** with visual diagrams, takeaways, weaknesses, source notes, and drill-through into the supporting BI rows.
- **Improvement catalog** that connects current data weaknesses to ontology fixes, expected value, dependencies, and priority.
- **Ask Ontology assistant surface** for narrative questions and inline table rendering when `ANTHROPIC_API_KEY` is configured.

## Live Routes

```text
/                         Project index
/retail                   Retail ontology overview
/retail/source/:table     Raw source table
/retail/plus/:table       Staging Plus table
/retail/bi/:id            BI dashboard
/retail/mechanics/:id     Diagnostic mechanic
/retail/triggers          Trigger queues
/retail/tasks             Ontology improvement catalog
/retail/ask               Ask Ontology
```

## Architecture

```text
Browser
  |
  | React + Vite app
  v
src/app
  |-- project registry and public index
  |
  v
src/retail
  |-- pages, components, routing, lineage metadata
  |-- typed API client
  |
  v
/api/* on Vercel
  |
  | FastAPI app via api/index.py
  v
backend/app
  |-- source, plus, bi, mechanics, triggers, improvements, ask routers
  |-- computed Python transforms
  |
  v
data/snapshot.db
```

The frontend is intentionally organized so future case studies can live beside `src/retail` and be promoted through an explicit public manifest. Folder existence alone does not publish a project.

## Local Development

Requirements:

- Node.js compatible with Vite 8
- Python 3.11+
- [`uv`](https://docs.astral.sh/uv/) for the FastAPI backend environment

Install frontend dependencies:

```bash
npm install
```

Run the backend:

```bash
npm run dev:api
```

Run the frontend in another terminal:

```bash
npm run dev
```

Build and test:

```bash
npm run build
npm test
uv run pytest
```

## Ask Ontology

The app works without an LLM key for normal browsing. The Ask Ontology surfaces call the backend `/api/ask` route and require:

```bash
ANTHROPIC_API_KEY=...
```

Put local secrets in `.env`. That file is ignored and should never be committed.

## Repository Layout

```text
api/                 Vercel Python entrypoint
backend/app/         FastAPI backend and ontology computations
backend/tests/       Backend consistency tests
data/snapshot.db     Small bundled SQLite case-study snapshot
docs/branding/       Public branding notes
public/              Logo, favicon, and static assets
src/app/             Shared public project index and registry
src/retail/          Retail case-study app
src/theme/           Shared visual tokens
```

Private brand source assets belong in `docs/branding/local-assets/`, which is intentionally ignored.

## Current Limitations

- Retail is the only public case study today.
- The bundled snapshot is a static case-study database, not a live data pipeline.
- Ask Ontology needs a configured Anthropic API key.
- The project does not currently declare an open-source license. Until a license is added, the code is public for reading and exploration, but reuse rights are not granted by default.
