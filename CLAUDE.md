# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flag-It is a **vanilla HTML/CSS/JS Progressive Web App (PWA)** for tracking bouldering sessions and hangboard training on mobile. There is no build system, no package manager, and no test framework. The UI language is **Dutch**.

The app has a **Supabase backend** for cloud sync and social features. Core application logic lives in `index.html` (~5,117 lines), with cloud and social logic split into separate files.

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Entire app — CSS, HTML, main JS (~5,117 lines) |
| `cloud.js` | Supabase auth + multi-device sync (~448 lines) |
| `social.js` | Kudos, follows, public profiles, feed, leaderboard, comments |
| `sw.js` | Service worker — offline caching (cache: `flagit-v11`) |
| `manifest.json` | PWA manifest |
| `supabase_schema.sql` | Postgres schema + RLS policies for the Supabase backend |
| `icons/` | PWA icons (192px, 512px) |

## Development Workflow

**To develop:** Open `index.html` directly in a browser. No build step required.

**To deploy:** Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) automatically deploys to GitHub Pages.

**Service worker cache:** Bump the cache name in `sw.js` (`flagit-v11` → `flagit-v12`, etc.) whenever making changes that need to invalidate cached assets for existing users. Also add any new static files to the cache array.

## Architecture

### Structure of index.html

| Section | Lines | Contents |
|---|---|---|
| `<style>` block | ~15–830 | All CSS, dark theme, accent color `#7f77dd` |
| HTML markup | ~832–1,172 | Page `<div>` sections + start/profile screens |
| `<script>` block | ~1,179–5,115 | All application logic (~188 functions) |

External dependencies loaded from CDN:
- **Chart.js v4.4.1** — `cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js`
- **Supabase JS v2** — `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- **Google Fonts** — Barlow font family

### Pages (bottom nav)

| Page | Element ID | Purpose |
|---|---|---|
| Home/Feed | `#page-home` | Recent sessions, filtering, streaks, milestones, social feed |
| Log Session | `#page-log` | Record bouldering sessions |
| Stats | `#page-stats` | Analytics, PRs, charts, heatmap, TLI |
| Goals | `#page-goals` | Grade goals, count goals, competitions countdown |
| Hangboard | `#page-hang` | Hang training logging + timer + PR tracking |
| Gyms | `#page-gyms` | Manage gyms, backup/restore, rival mode |
| Projects | `#page-projects` | Track boulder projects (status, attempts, highpoint, notes) |
| Coach | `#page-coach` | AI-powered insights, training plans, stroke radar chart |

Navigation is driven by `showPage(pageId)`.

### Data model

All state lives in global arrays, persisted to **localStorage** and optionally synced to **Supabase**. Keys are **profile-scoped** — each key includes `_{profileId}` as a suffix. Profiles themselves use a global key.

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
| (cloud dirty) | `flagit_cloud_dirty_{profileId}` | Pending sync changes per table (cloud.js) |
| (auth) | `flagit_auth` | Supabase auth session (cloud.js) |
| (install prompt) | `flagit_install_dismissed_v1` | PWA install banner dismiss state |

**Mutation pattern:** Mutate the array directly → call the corresponding save function (`save()`, `saveGyms()`, `saveGoals()`, `saveHang()`, etc.). There is no reactive binding.

### Cloud Sync (cloud.js)

Cloud sync is powered by **Supabase** (Postgres + Auth). The file is loaded as a separate script and exposes functions used by index.html.

**Auth:**
- `cloudSignIn(email, pw)` / `cloudSignUp(email, pw)` / `cloudSignInGoogle()` / `cloudSignOut()`
- Auth state shown via a cloud badge in the UI

**Sync architecture:**
- Dirty tracking per table stored in `flagit_cloud_dirty_{pid}`
- Push/pull model; conflict resolution via `onConflict: 'user_id,profile_id,local_id'`
- Synced tables: `sessions`, `gyms`, `goals`, `hang_sessions`, `projects`, `injuries`, `competitions`, `gym_resets`, `active_plans`
- Field mapping: local camelCase ↔ database snake_case (e.g. `sessionStart` ↔ `session_start`)
- Sync status indicator in UI: idle / syncing / error / offline

### Social Features (social.js)

Social features require a Supabase account and operate on the cloud tables.

| Feature | Functions |
|---|---|
| Kudos | `giveKudos()`, `removeKudos()`, `toggleKudos()` |
| Follows | `socialFollow()`, `socialUnfollow()`, `getFollowingIds()`, `isFollowing()` |
| Social feed | `renderSocialFeed()` — sessions from followed users with heatmap visualisation |
| Comments | `showComments()`, `postComment()` — modal with live update |
| Public profiles | `showPublicProfile()` — stats, recent sessions, follow button |
| Leaderboard | `renderLeaderboard()` — top 25 climbers over last 90 days by PR grade |
| User search | `renderUserSearch()` — ilike username filtering with follow buttons |
| Session visibility | `setSessionPublic()` — toggle `is_public` flag |

### Supabase Schema (supabase_schema.sql)

13 tables with Row Level Security (RLS):

| Table | Purpose |
|---|---|
| `accounts` | User profile — display name, bio, emoji |
| `sessions` | Climbing sessions with routes, feel, `is_public` flag |
| `gyms` | Gym locations |
| `goals` | Grade + count goals with deadlines |
| `hang_sessions` | Hangboard training sets |
| `projects` | WIP routes — status, attempts, highpoint, notes |
| `injuries` | Injury tracking with severity/status |
| `competitions` | Competition info |
| `gym_resets` | When gyms reset their routes |
| `active_plans` | Active training plan (plan_id, start_date) |
| `follows` | User follow relationships |
| `kudos` | Per-session appreciation (anonymous-safe, deduped) |
| `comments` | Comments on sessions |

Triggers: auto `updated_at` on sessions/goals/projects; auto account creation on signup.

### Multi-profile support

Users can create/switch/delete profiles. Each profile has its own isolated dataset. The active profile ID is stored separately in localStorage and loaded on app start. Functions that read/write data always operate on the active profile's keys.

### Key constants (hardcoded in JS)

- `GRADES` — 20 climbing grades from `'4'` to `'8b+'`, each with a hex color
- `TYPES` — 9 route types (Slab, Vertical, Overhang, etc.)
- `GRIPS` — 9 grip types for hangboard (Crimp, Jug, Open hand, etc.)

### Rendering pattern

All UI updates use direct `element.innerHTML = templateLiteralString` assignments. There is no virtual DOM or templating library. Modals/overlays are created dynamically and dismissed on background click.

### Charts

Five Chart.js instances — destroy with `.destroy()` before re-creating to prevent memory leaks:

| Variable | Type | Canvas | Purpose |
|---|---|---|---|
| `chartH` | Line | `#chart-hang` | Hangboard hang time progression |
| `tliChart` | Bar | (dynamic) | Training Load Index per week |
| `chartP` | Line | `#chart-progress` | Max grade per session (clickable) |
| `chartG` | Bar | `#chart-grades` | Routes per grade (completed) |
| `stokeRadarChart` | Radar | (dynamic) | Stroke type distribution (Coach page) |

### Session editing

Uses two globals: `editMode` (boolean) and `editSessionId` (string). The save form function checks these to decide whether to insert or update a record.

### Finding functions

With ~188 functions in a single file, use grep/search to locate them by name. Functions are grouped loosely by feature area in the script block:

profile management → data persistence → feed rendering → forms → charts → goals → hangboard → coach → projects → advanced features → competitions → injuries

## Conventions

- **XSS protection:** User-supplied strings must be HTML-escaped before insertion into `innerHTML`. Use the existing `escHtml()` utility function for this.
- **Mobile-first:** The layout targets max-width 430px. Use CSS `env(safe-area-inset-*)` for fixed bottom elements.
- **Dutch UI:** All user-facing text is in Dutch. Keep new strings in Dutch.
- **PWA offline:** All new static assets must be listed in the `sw.js` cache array and the cache version bumped.
- **No build system** — keep logic self-contained; avoid introducing npm dependencies or build tools.
- **Cloud-aware mutations:** If a data mutation should sync to Supabase, mark the relevant table dirty via the cloud.js dirty-tracking mechanism after saving to localStorage.

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

Call `loadNewThings()` inside the profile-load flow alongside the other load calls. If the data should sync to Supabase, add a corresponding table to `supabase_schema.sql` and wire it into the push/pull logic in `cloud.js`.
