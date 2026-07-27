# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flag-It is a **vanilla HTML/CSS/JS Progressive Web App (PWA)** for tracking bouldering sessions and hangboard training on mobile. There is no build system, no package manager, and no test framework. The UI language is **Dutch**.

The app has a **Supabase backend** for cloud sync and social features. Core application logic lives in `index.html` (~5,600 lines), with cloud and social logic split into separate files.

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Entire app — CSS, HTML, main JS (~5,600 lines) |
| `cloud.js` | Supabase auth + multi-device sync (~785 lines) |
| `social.js` | Kudos, follows, public profiles, feed, leaderboard, comments (~545 lines) |
| `sw.js` | Service worker — offline caching (cache: `flagit-v24`) |
| `manifest.json` | PWA manifest |
| `supabase_schema.sql` | Postgres schema + RLS policies for the Supabase backend |
| `icons/` | PWA icons (192px, 512px) |

## Development Workflow

**To develop:** Open `index.html` directly in a browser. No build step required.

**To deploy:** Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) automatically deploys to GitHub Pages.

**Service worker cache:** Bump the cache name in `sw.js` (`flagit-v22` → `flagit-v23`, etc.) whenever making changes that need to invalidate cached assets for existing users. Also add any new static files to the cache array.

**Open beslissing (offline CDN):** de service worker cachet alleen first-party bestanden; Chart.js, Supabase JS en Google Fonts komen van CDN's zonder offline fallback. Een volledig offline cold load mist dus grafieken en cloud-features (de rest werkt). Bewuste trade-off tot de product-eigenaar beslist of de drie CDN-URL's een runtime cache-first strategie in `sw.js` krijgen.

## Architecture

### Structure of index.html

| Section | Lines | Contents |
|---|---|---|
| `<style>` block | ~15–885 | All CSS, dark theme, accent color `#7f77dd` |
| HTML markup | ~887–1,274 | Page `<div>` sections + start/profile screens |
| `<script>` block | ~1,275–5,599 | All application logic (~200 functions) |

External dependencies loaded from CDN:
- **Chart.js v4.4.1** — `cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js`
- **Supabase JS v2** — `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- **Google Fonts** — Barlow font family

### Pages (bottom nav)

Nav is consolidated to **5 tabs**. Several former top-level pages now live as subtabs inside another page; their original `<div id="page-*">` shells still exist but are empty (content moved into the parent page's subtab containers).

| Nav label | Element ID | Purpose | Subtabs |
|---|---|---|---|
| Feed | `#page-home` | Recent sessions, filtering, streaks, milestones | `switchFeedTab()`: Feed · **Sociaal** (social feed/search/leaderboard, itself split via `switchSociaalTab()`) |
| Loggen | `#page-log` | Record bouldering sessions | — |
| Analyse | `#page-stats` | Analytics, PRs, charts, heatmap, TLI | `switchAnalyseTab()`: Stats · **Coach** (AI insights, training plans, stroke radar) |
| Doelen | `#page-goals` | Grade/count goals, competitions countdown | `switchDoelenTab()`: Doelen · **Projecten** (boulder project tracking) |
| Meer | `#page-gyms` | Manage gyms, backup/restore, rival mode | `switchMeerTab()`: Gyms · **Hangboard** (hang training logging + timer + PR tracking) |

Empty legacy shells kept for compatibility: `#page-hang`, `#page-coach`, `#page-sociaal` (all rendered via the subtab containers above, not directly navigated to).

Navigation is driven by `showPage(pageId)`; subtab switching within a page uses one of the five `switch*Tab()` functions above (see [Tab-switching pattern](#code-consolidatiepatronen)).

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
| (language) | `flagit_lang_v1` | UI language: `'nl'` (default) or `'en'` (global, no suffix) |

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

16 tables with Row Level Security (RLS):

| Table | Purpose |
|---|---|
| `accounts` | User profile — display name, bio, emoji, `is_admin` flag |
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
| `app_settings` | Global key/value config (e.g. `ads_enabled`) — anyone reads, admin-only writes |
| `sponsored_card` | Single-row active sponsor config (logo/title/CTA) — anyone reads, admin-only writes |
| `feedback` | Private feedback channel — anyone can insert (incl. logged out), admin-only select |

Triggers: auto `updated_at` on sessions/goals/projects; auto account creation on signup.

**Admin check:** `is_admin` on `accounts` is not publicly readable directly — use the `check_is_admin` RPC (wrapped by `cloudIsAdmin()` in cloud.js) rather than querying the column.

**Ads/admin feature:** `ADS_ENABLED` + `_sponsoredCard` in index.html gate a sponsored-card unit shown on Stats; admin-only UI (toggle ads, edit sponsor, read feedback) is gated behind `cloudIsAdmin()`.

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

### Internationalization (i18n)

The app supports **Dutch (default) and English**, chosen via a toggle in Meer → Taal / Language. Rather than threading a `t('key')` call through every one of the ~200 `render*()` functions, translation happens as a **live DOM pass**, defined near the top of the `<script>` block in `index.html` (right after the `GRADES`/`TYPES`/`GRIPS` constants):

- `currentLang` (`'nl'`|`'en'`) is read from `localStorage['flagit_lang_v1']` at load time. `setLang(lang)` persists the choice and calls `location.reload()` — a full reload is the simplest way to safely re-render everything in the new language.
- `LOCALE()` returns `'en-US'`/`'nl-NL'` for use in `toLocaleDateString`/`toLocaleString` calls (`fmtDate`, `dateBucket`, etc.) so dates/weekdays/months localize correctly.
- `I18N_PATTERNS` (regex → replacement) and `I18N_PHRASES` (plain NL substring → EN substring, sorted longest-first) together define the translation. `i18nTranslate(str)` applies patterns then phrases; it is a no-op when `currentLang !== 'en'`.
- `translateSubtree(node)` walks text nodes plus `placeholder`/`title`/`aria-label` attributes, only writing back when the translated value actually differs (writing back an unchanged value would re-trigger the observer below and loop).
- A single `MutationObserver` on `document.body` (installed once via `initI18nObserver()`) calls `translateSubtree` on every added/changed node when `currentLang === 'en'`. Because every `render*()` function already works by reassigning `innerHTML`, this one observer transparently covers all current and future dynamic content — no per-function changes needed.
- Since NL is the untouched source language, adding a new Dutch string needs **no code change** for Dutch. To make it appear translated in English, add an `['Dutch phrase','English phrase']` entry to `I18N_PHRASES` (or a regex to `I18N_PATTERNS` if the string has interpolated values). Prefer the longest, most specific phrase that makes sense — the sort-by-length means longer entries are substituted before shorter/generic ones, avoiding accidental partial-word matches (e.g. `'Wisselen'` must have its own entry so the generic `'Wis'→'Clear'` rule doesn't mangle it into `'Clearselen'`).

### Finding functions

With ~200 functions in a single file, use grep/search to locate them by name. Functions are grouped loosely by feature area in the script block:

profile management → data persistence → feed rendering → forms → charts → goals → hangboard → coach → projects → advanced features → competitions → injuries

## Conventions

- **XSS protection:** User-supplied strings must be HTML-escaped before insertion into `innerHTML`. Use the existing `escHtml()` utility function for this.
- **Mobile-first:** The layout targets max-width 430px. Use CSS `env(safe-area-inset-*)` for fixed bottom elements.
- **Dutch UI, EN/NL toggle:** All source strings (HTML markup + JS template literals) are written in Dutch — keep new strings in Dutch. English is a runtime translation layer on top (see [Internationalization (i18n)](#internationalization-i18n)); when adding new user-facing text, no code change is required for English support, but add an entry to the `I18N_PHRASES` dictionary in `index.html` if the string should be translatable.
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

## Optimization Guidelines

These guidelines exist to streamline the PWA — no new features, only improving what's already there.

### Navigation Consolidation — voltooid

De nav is teruggebracht van 8 naar **5 tabs**: Feed · Loggen · Analyse · Doelen · Meer. Coach zit als subtab in Analyse, Hangboard + Gyms zijn samengevoegd in Meer, Projecten zit als subtab in Doelen, en Sociaal zit als subtab in Feed. Zie de [Pages-tabel](#pages-bottom-nav) voor de actuele structuur. Geen verdere actie nodig hier — voeg nieuwe subtabs toe met hetzelfde `switch*Tab()`-patroon in plaats van nieuwe top-level pagina's, tenzij een feature echt dagelijks-gebruik verdient.

### Visuele Consistentie

Gebruik uitsluitend deze waarden — geen uitzonderingen bij nieuwe of gewijzigde stijlen.

**Spacing-schaal:**
- `8px` — ruimte binnen componenten (bijv. icon + label)
- `12px` — standaard `margin-bottom` tussen kaarten
- `16px` — `padding` voor kaarten, ruimte tussen secties
- `20px` — ruimte tussen pagina-secties
- `24px` — bovenmarge van een pagina

**Border-radius (3 vaste maten):**
- `12px` — knoppen, inputs, chips
- `14px` — kaarten (`.goal-card`, `.project-card`, `.hang-card`, `.comp-card`, etc.)
- `16px` — modals, bottom sheets

**Knop-lettertypes (2 groottes):**
- `14px` — secundaire/utility-knoppen
- `17px` — primaire actieknoppen (`.btn-save`, `.btn-add-*`)

**CSS-consolidatie — voltooid:**

1. ✅ `.card-base` bestaat en draagt de gedeelde kaartdeclaraties; `.goal-card`, `.project-card`, `.comp-card` en `.hang-card` worden gerenderd als `class="card-base <type>-card"` en houden alleen hun echte verschillen (`.hang-card`: geen padding, `overflow:hidden`, tragere animatie).
2. ✅ Eén `.btn-delete` klasse vervangt de vijf oude delete-knop-rules; `.btn-ps-delete` en `.btn-delete-project` bestaan nog als dunne modifiers bovenop `.btn-delete`.
3. ✅ `margin-bottom` van alle kaarten is `12px` (via `.card-base`).

De bredere spacing/radius/font-normalisatie (alle waarden buiten de kaarten en delete-knoppen) is bewust **niet** in één keer gedaan — pas de schaal hierboven toe bij het aanraken van betreffende regels.

### UX-verbeteringen

**Tab-switching patroon — voltooid:**

Eén generieke `switchTab(prefix, tabs, active)` doet het knop/paneel-werk via de id-conventie `tab-{prefix}-{naam}` (knop) / `{prefix}-tab-{naam}` (paneel). De vijf `switch*Tab()`-functies bestaan nog als dunne wrappers die de state-variabele zetten en per-tab render-side-effects aanroepen. Nieuwe subtabs: volg de id-conventie en roep `switchTab` aan vanuit een wrapper.

**Feedbackstaten — voltooid:**

- `.is-loading` (in CSS) wordt toegepast op elke knop die een netwerk-round-trip start: auth-flows (beide schermen), kudos, volgen/ontvolgen, reactie posten, feedback versturen. Nieuwe async knoppen volgen hetzelfde patroon.
- Toast-audit: alle `save*()`-functies toasten `'Opslaan mislukt'` bij een localStorage-fout, en elke gebruikersactie geeft feedback (toast of zichtbare navigatie/re-render). Bewuste keuze: **geen** succes-toast ín de low-level save-functies zelf — backup-restore en delete-flows roepen meerdere saves na elkaar aan en tonen al hun eigen feedback; een toast per save zou spammen. `saveDraft()` blijft een stille autosave.

**Lege staten — voltooid:**

Elke `render*()`-functie die een lijst toont rendert een `.empty-state`-blok bij een lege array (feed, gyms, doelen, hangboard, projecten, dagboek, competities, blessurelog, reset-sectie). Houd dit aan voor nieuwe lijsten:

```js
if (!items.length) {
  el.innerHTML = '<div class="empty-state">Nog niets hier.</div>';
  return;
}
```

**Quick-log shortcut — voltooid:**

De quick-actionrow op Home (`.home-qa-btn` — "+ Sessie loggen" / "⚡ Snel toppen") en het `.quick-top-sheet`-patroon (`openQuickTop()`) zijn aanwezig en zichtbaar op de Home-pagina.

### Code-consolidatiepatronen

Pas deze patronen toe bij aanraking van bestaande code — geen grootschalige refactor in één keer.

**Delete-functies — voltooid:** alle delete-flows gebruiken `deleteItem(arr, id, saveFn, renderFn)` (splice in place → save → render) en de gedeelde bevestigingsmodal `showDeleteConfirm(title, sub, onConfirm)`. Gebruik beide voor nieuwe delete-flows. Bekende uitzondering: `deleteGoal` verwijdert zonder bevestiging — bewust zo gelaten tot de product-eigenaar beslist of doelen ook een confirm verdienen.

**Kaartrendering:** elke `render*()`-functie bouwt HTML via template literals. De buitenste wrapper gebruikt altijd de basisklasse + typemodifier (bijv. `class="card-base goal-card"`), niet afzonderlijke conflicterende stijlen.

**Dirty-tracking na mutaties:** elke datamutatie roept zowel `save*()` als `markDirty(tableName)` aan (uit `cloud.js`) als de tabel synct naar Supabase.
