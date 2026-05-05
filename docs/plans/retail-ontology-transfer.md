# Retail Ontology Frontend Transfer Plan

## Summary

Build a root-level shared Ontology React app and make `retail/` the first ontology subproject. Transfer the existing source frontend into this repo, then perform a full legacy-brand purge across filenames, code symbols, routes, comments, docs, tests, UI text, metadata, storage keys, and assets.

The implementation is not complete until the repository contains no instances of the forbidden legacy brand token in any casing.

## Key Changes

- Create the app at the ontology repo root with Vite, React, TypeScript, `src/`, `public/`, package scripts, and shared app chrome.
- Organize retail-specific experience under `src/retail` while keeping shared shell, theme, and components reusable for future ontology builds.
- Rename all assistant, improvement, route, type, API client, and data concepts to Ontology naming.
- Remove the old remote logo, old favicon/title, old color tokens, old component names, old test names, and old comments.
- Do not leave compatibility aliases that preserve the legacy brand string.

## Branding

- Add `docs/branding/` with committed palette guidance and open-source-safe usage notes.
- Use:
  - Background: `#222222`
  - Text: `#FFFFFF`
  - Primary blue: `#17456A`
  - Accent blue: `#86C6CA`
  - Alert red: `#F12924`
  - Neutral dark: `#010101`
- Use semantic table colors for source, derived, inferred, and alert states without reusing the old identity.
- Place private logo source files from `/Users/jacktippet/Documents/1_Email Dropper/logo` in a gitignored local branding asset folder.
- Only commit assets that are safe for the open-source repo.

## Acceptance Checks

- Run a full case-insensitive forbidden legacy-brand scan across the entire ontology repo and require zero matches.
- Run build and tests from the new root app.
- Inspect the app in desktop and mobile widths for dark-mode contrast, readable tables, correct logo/favicon handling, and no legacy brand remnants.

## Assumptions

- The repo should use one shared root app, not a nested `retail/frontend` app.
- Public app identity is `Ontology`.
- The first pass can assume backend/data contracts will be renamed to match the frontend ontology terms.
- Backend migration is out of this first implementation unless explicitly added later.
- The source frontend was the previously explored Vite app in the legacy project. The exact parent path is intentionally not written here because it contains the forbidden token.
