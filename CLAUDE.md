# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flag-It is a **vanilla HTML/CSS/JS Progressive Web App (PWA)** for tracking bouldering sessions and hangboard training on mobile. There is no build system, no package manager, and no test framework — the entire application lives in a single `index.html` file (~4,741 lines). The UI language is **Dutch**.

## Development Workflow

**To develop:** Open `index.html` directly in a browser. No build step required.

**To deploy:** Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) automatically deploys to GitHub Pages.

**Service worker cache:** Bump the cache name in `sw.js` (`flagit-v8` → `flagit-v9`, etc.) whenever making changes that need to invalidate cached assets for existing users.

## Architecture

### Single-file structure

`index.html` contains everything in order:
1. `<style>` block (lines ~15–700) — all CSS, dark theme, accent color `#7f77dd`
2. HTML markup (lines ~700–1,053) — page `<div>` sections + start/profile screens
3. `<script>` block (lines ~1,054–4,739) — all application logic (~181 functions)

External dependencies loaded from CDN:
- **Chart.js v4.4.1** — for progress/grade/hangtime charts
- **Google Fonts** — Barlow font family

### Pages (bottom nav)

| Page | Element ID | Purpose |
|---|---|---|
| Home/Feed | `#page-home` | Recent sessions, filtering, streaks, milestones |
| Log Session | `#page-log` | Record bouldering sessions |
| Stats | `#page-stats` | Analytics, PRs, charts, heatmap |
| Goals | `#page-goals` | Grade goals and count goals |
| Hangboard | `#page-hang` | Hang training logging + timer |
| Gyms | `#page-gyms` | Manage gyms, backup/restore data |
| Projects | `#page-projects` | Track boulder projects (status, attempts, notes) |
| Coach | `#page-coach` | AI-powered insights, training plans, finger health |

Navigation is driven by `showPage(pageId)`.

### Data model

All state lives in global arrays, persisted to localStorage. Keys are **profile-scoped** — each key includes `_{profileId}` as a suffix (e.g., `flagit_sessions_v2_abc123`). Profiles themselves use a global key.

| Variable | localStorage key pattern | Contents |
|---|---|---|
| `sessions` | `flagit_sessions_v2_{profileId}` | Bouldering session records |
| `gyms` | `flagit_gyms_v1_{profileId}` | Gym list with favorite flag |
| `goals` | `flagit_goals_v2_{profileId}` | Grade goals and count goals |
| `hangSessions` | `flagit_hang_v1_{profileId}` | Hangboard training records |
| `projects` | `flagit_projects_v1_{profileId}` | Boulder project tracking |
| `injuries` | `flagit_injuries_v1_{profileId}` | Injury/finger health log |
| `competitions` | `flagit_comp_v1_{profileId}` | Competition records |
| `gymResets` | `flagit_resets_v1_{profileId}` | Gym route reset dates |
| `activePlan` | `flagit_plan_v1_{profileId}` | Active AI training plan |
| (profiles) | `flagit_profiles_v1` | All profile metadata (global, no suffix) |

**Mutation pattern:** Mutate the array directly → call the corresponding save function (`save()`, `saveGyms()`, `saveGoals()`, `saveHang()`, etc.). There is no reactive binding.

### Multi-profile support

Users can create/switch/delete profiles. Each profile has its own isolated dataset. The active profile ID is stored separately in localStorage and loaded on app start. Functions that read/write data always operate on the active profile's keys.

### Key constants (hardcoded in JS)

- `GRADES` — 20 climbing grades from `'4'` to `'8b+'`, each with a hex color
- `TYPES` — 9 route types (Slab, Vertical, Overhang, etc.)
- `GRIPS` — 9 grip types for hangboard (Crimp, Jug, Open hand, etc.)

### Rendering pattern

All UI updates use direct `element.innerHTML = templateLiteralString` assignments. There is no virtual DOM or templating library. Modals/overlays are created dynamically and dismissed on background click.

### Charts

Three Chart.js instances (`progressChart`, `gradesChart`, `hangChart`) are destroyed with `.destroy()` before being re-created to prevent memory leaks.

### Session editing

Uses two globals: `editMode` (boolean) and `editSessionId` (string). The save form function checks these to decide whether to insert or update a record.

### Finding functions

With ~181 functions in a single file, use grep/search to locate them by name. Functions are grouped loosely by feature area in the script block (profile management → data persistence → feed rendering → forms → charts → goals → hangboard → coach → projects → advanced features).

## Conventions

- **XSS protection:** User-supplied strings must be HTML-escaped before insertion into `innerHTML`. Use the existing `escHtml()` utility function for this.
- **Mobile-first:** The layout targets max-width 430px. Use CSS `env(safe-area-inset-*)` for fixed bottom elements.
- **Dutch UI:** All user-facing text is in Dutch. Keep new strings in Dutch.
- **PWA offline:** All new static assets must be listed in the `sw.js` cache array and the cache version bumped.
- **No external state or frameworks** — keep logic self-contained in the script block; avoid introducing npm dependencies or build tools.

## Extending the App

Flag-It is actively developed — new features and pages are welcome. Follow these patterns:

### Adding a new page

1. Add `<div id="page-newname" class="page">` in the HTML markup section
2. Add a nav/button that calls `showPage('page-newname')`
3. Implement render + init functions in the script block, grouped near related features
4. If the page needs its own data, add a localStorage key following the `flagit_<name>_v1_{profileId}` pattern with a save/load function pair (see existing examples like `saveProjects()` / `loadProjects()`)

### Adding a feature to an existing page

1. Grep for a nearby function to find the right section in the script block
2. Add new functions there, following the mutation pattern: mutate array → call save function
3. Render new UI via `innerHTML` template literals or add static HTML to the page's `<div>`
4. Always escape user input with `escHtml()` before inserting into the DOM

### Adding a new data collection

```js
let newThings = [];
function saveNewThings() {
  localStorage.setItem('flagit_newthings_v1_' + activeProfile, JSON.stringify(newThings));
}
function loadNewThings() {
  newThings = JSON.parse(localStorage.getItem('flagit_newthings_v1_' + activeProfile) || '[]');
}
```

Call `loadNewThings()` inside the profile-load flow alongside the other load calls.
