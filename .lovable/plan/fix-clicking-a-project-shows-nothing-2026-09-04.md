# Fix: clicking a project shows nothing

## What is happening

The project page is built and working, but the projects list is sitting on top of it. Because of how the two pages are named, the list page has become a wrapper around the project page — and it never makes room for it. So when you click a project the address changes but the list stays on screen and the project page never appears.

Nothing is wrong with the project page itself, the upload area, or your data.

## The fix

Separate the two pages so the list is just the list and the project page stands on its own. After that, clicking a project opens it, with its drag-and-drop upload area and the drawing list underneath.

Also add a "back to projects" link check so navigation reads cleanly both ways.

## Verification

- Sign in, open Projects, click a project: the project page opens with the upload area.
- The projects list still loads and creating a project still works.
- The link back to all projects returns to the list.

## Technical notes

- `src/routes/_authenticated/projects.tsx` currently generates as a parent route of `projects.$projectId` (`AuthenticatedProjectsRouteWithChildren`) but renders no `<Outlet />`, so the child never mounts.
- Rename it to `src/routes/_authenticated/projects.index.tsx` (content unchanged) so `/projects` is a leaf index route and `/projects/$projectId` is a sibling under `_authenticated`.
- `src/routeTree.gen.ts` regenerates automatically; no manual edit.
- No database, RLS, or reading-step changes. Phase 2 is not started.
