# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlagIt is a **vanilla HTML/CSS/JS Progressive Web App (PWA)** for tracking bouldering sessions and hangboard training on mobile. There is no build system, no package manager, and no test framework. The UI ships in **English by default**, with Dutch available via a toggle. Note the split: English is what users see, but **Dutch is the source language in the code** — see [Internationalization (i18n)](#internationalization-i18n).

The app has a **Supabase backend** for cloud sync and social features. Core application logic lives in `index.html` (~6,900 lines), with cloud and social logic split into separate files.

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Entire app — CSS, HTML, main JS (~6,900 lines) |
| `cloud.js` | Supabase auth + multi-device sync (~790 lines) |
| `social.js` | Kudos, follows, public profiles, feed, leaderboard, comments (~560 lines) |
| `sw.js` | Service worker — offline caching (cache: `flagit-v31`) |
| `manifest.json` | PWA manifest |
| `supabase_schema.sql` | Postgres schema + RLS policies for the Supabase backend |
| `icons/` | PWA icons (192px, 512px) |
| `marketing/instagram-launch/` | **Separate** Node + Playwright subproject for launch graphics — see [Marketing subproject](#marketing-subproject) |
| `.mcp.json` | MCP servers used during development (Supabase, accesslint) |
| `skills-lock.json` + `.claude/skills/` | Vendored Supabase agent skills |

## Development Workflow

**To develop:** Open `index.html` directly in a browser. No build step required.

**To deploy:** Push to `main` — GitHub Actions (`.github/workflows/deploy.yml`) automatically deploys to GitHub Pages.

**Service worker cache:** Bump the cache name in `sw.js` (`flagit-v30` → `flagit-v31`, etc.) whenever making changes that need to invalidate cached assets for existing users. Also add any new static files to the `ASSETS` array.

**CI gate — `Validate files`:** the deploy workflow fails the build if `index.html` is missing `</html>`, or if `sw.js` has no cache entry for `cloud.js`, `social.js`, `index.html`, or `manifest.json`. Adding a new static asset to the `sw.js` cache array is therefore not just a convention — for those four files it is enforced, and forgetting it breaks the deploy rather than silently shipping a stale cache.

**Open decision (offline CDN):** the service worker caches only first-party files; Chart.js, Supabase JS and Google Fonts come from CDNs with no offline fallback. A fully offline cold load therefore loses charts and cloud features (the rest works). This is a deliberate trade-off until the product owner decides whether the three CDN URLs should get a runtime cache-first strategy in `sw.js`.

### Marketing subproject

`marketing/instagram-launch/` renders 1080×1080 launch graphics with Node + Playwright (`build/render.js` for the post templates, `build/capture-app.js` for app screenshots) from HTML templates in `src/` into `out/`. It has its own README and its own dependencies.

This does **not** contradict the app's "no build system" rule — that rule governs `index.html`, `cloud.js` and `social.js`, which must stay dependency-free and directly openable in a browser. The marketing folder is tooling that sits beside the app and never ships with it.

## Architecture

### Structure of index.html

| Section | Lines | Contents |
|---|---|---|
| `<style>` block | 16–899 | All CSS, dark theme, accent color `#7f77dd` |
| HTML markup | 901–1,311 | Page `<div>` sections + profile/start screens |
| `<script>` block | 1,316–6,896 | All application logic (~250 functions) |

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
| Meer | `#page-gyms` | Manage gyms, backup/restore, rival mode, setter, language toggle | `switchMeerTab()`: Gyms · **Hangboard** (hang training logging + timer + PR tracking) |

Empty legacy shells kept for compatibility: `#page-hang`, `#page-sociaal`, `#page-coach` (all rendered via the subtab containers above, not directly navigated to).

**`showPage(id, direction)` takes the short id, not the element id** — `showPage('home')`, not `showPage('page-home')`. It prepends `page-` internally. The three retired ids are redirected at the top of the function (`sociaal` → home + Sociaal subtab, `coach` → stats + Coach subtab, `hang` → gyms + Hangboard subtab), which is why old deep links still land somewhere sensible.

`showPage()` also: guards navigation away from a half-filled log form (`showNavLeaveConfirm()`), resets edit mode, and picks a slide direction from `PAGE_ORDER` (`['home','log','stats','goals','gyms']`). Subtab switching within a page uses one of the five `switch*Tab()` wrappers (see [Tab-switching pattern](#code-consolidation-patterns)).

### Data model

All state lives in global arrays, persisted to **localStorage** and optionally synced to **Supabase**. Keys are **profile-scoped** — each key includes `_{profileId}` as a suffix. Profiles themselves use a global key.

The key strings are built in one place, `profileStorageKeys(id)`, and assigned to the module-level constants `SK`, `GYK`, `GOK`, `HSK`, `PRK`, `IJK`, `PLK`, `CMPK`, `RSTK`, `LDK`, `PLRK` — which are **reassigned on every profile switch** inside `selectProfile()`. That is why they are `let`, not `const`: never cache a key string, and never build one inline from a profile id.

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
| `projectLoreCache` | `flagit_project_lore_v1_{profileId}` | Cached generated Quest Lore per project |
| (log draft) | `flagit_log_draft_v1_{profileId}` | Autosaved in-progress log form |
| (seen) | `flagit_seen_v1_{profileId}` | First-run / start-screen seen flag |
| (profiles) | `flagit_profiles_v1` | All profile metadata (global, no suffix) |
| (cloud dirty) | `flagit_cloud_dirty_{profileId}` | Pending sync changes per table (cloud.js) |
| (auth) | `flagit_auth` | Supabase auth session (cloud.js) |
| (install prompt) | `flagit_install_dismissed_v1` | PWA install banner dismiss state |
| (language) | `flagit_lang_v1` | UI language: `'en'` (default) or `'nl'` (global, no suffix) |
| (signup source) | `flagit_signup_source_v1` | `utm_source` captured on first load (global) |
| (google migrate) | `flagit_google_migrate` | One-shot Google-signin migration flag (global) |

**Mutation pattern:** Mutate the array directly → call the corresponding save function (`save()`, `saveGyms()`, `saveGoals()`, `saveHang()`, etc.). There is no reactive binding.

### Boot sequence

The app boots from a `bootstrap()` IIFE at the very bottom of the `<script>` block. Order matters:

1. `captureMarketingParams()` — a separate IIFE near the *top* of the script, before the i18n init (see [Marketing attribution](#marketing-attribution)).
2. `maybeRunMigration()` — legacy-data migration.
3. `initAdsState()` + `_loadSponsoredCard()` — non-blocking.
4. `showLoginFirstScreen(afterLogin)` from `cloud.js` — **the login gate comes before the profile screen.**
5. In the `afterLogin` callback: one local profile → `selectProfile()` it; several → `renderProfileScreen()`; none → check the cloud via `cloudCurrentUser()` + `cloudCheckHasData()` and restore or auto-create a profile from the account; otherwise open the new-profile form.

There is a fallback path for when `cloud.js` failed to load: straight to `renderProfileScreen()`.

### Cloud Sync (cloud.js)

Cloud sync is powered by **Supabase** (Postgres + Auth). The file is loaded as a separate script and exposes functions used by index.html.

**Auth:**
- `cloudSignIn(email, pw)` / `cloudSignUp(email, pw)` / `cloudSignInGoogle()` / `cloudSignOut()`
- `showLoginFirstScreen()` (boot gate) and `showAuthScreen()` (in-app) are two separate screens with parallel handlers — `doSignIn`/`doSignUp` vs `lfsDoSignIn`/`lfsDoSignUp`. Changing one auth flow usually means changing both.
- Auth state shown via a cloud badge in the UI (`cloudUpdateAuthBadge()`)

**Sync architecture:**
- Dirty tracking per table stored in `flagit_cloud_dirty_{pid}`; mark via **`cloudMarkDirty(table)`**
- Push/pull model; conflict resolution via `onConflict: 'user_id,profile_id,local_id'`
- Synced tables: `sessions`, `gyms`, `goals`, `hang_sessions`, `projects`, `injuries`, `competitions`, `gym_resets`, `active_plans`
- `active_plans` is single-row per profile and has its own `_pushPlan()` / `_pullPlan()` path with `onConflict: 'user_id,profile_id'`
- Field mapping: local camelCase ↔ database snake_case via `_toRow()` / `_fromRow()` (e.g. `sessionStart` ↔ `session_start`)
- Sync status indicator in UI: idle / syncing / error / offline (`cloudSetStatus()`)

### Social Features (social.js)

Social features require a Supabase account and operate on the cloud tables.

| Feature | Functions |
|---|---|
| Kudos | `giveKudos()`, `removeKudos()`, `toggleKudos()`, `loadKudosForSession()`, `loadFeedKudos()` |
| Follows | `socialFollow()`, `socialUnfollow()`, `getFollowingIds()`, `isFollowing()` |
| Social feed | `renderSocialFeed()` — sessions from followed users with heatmap visualisation |
| Comments | `showComments()`, `postComment()` — modal with live update |
| Public profiles | `showPublicProfile()` — stats, recent sessions, follow button |
| Leaderboard | `renderLeaderboard()` — top 25 climbers over last 90 days by PR grade |
| User search | `renderUserSearch()` — ilike username filtering with follow buttons |
| Session visibility | `setSessionPublic()` — toggle `is_public` flag |

`social.js` has its own escape helper, `_s()` — it is a separate file with no access to `index.html`'s `esc()`.

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

Postgres functions: `handle_updated_at()` (trigger — auto `updated_at` on sessions/goals/projects), `handle_new_user()` (trigger — auto account creation on signup), `check_is_admin()` (RPC).

**Admin check:** `is_admin` on `accounts` is not publicly readable directly — use the `check_is_admin` RPC (wrapped by `cloudIsAdmin()` in cloud.js) rather than querying the column. Note that table-level grants override a column-level `REVOKE`, so the protection lives in the RPC + grants, not in a column privilege.

**Ads/admin feature:** `ADS_ENABLED` + `_sponsoredCard` in index.html gate a sponsored-card unit shown on Stats; admin-only UI (toggle ads, edit sponsor, read feedback) is gated behind `cloudIsAdmin()`.

### Multi-profile support

Users can create/switch/delete profiles. Each profile has its own isolated dataset. The active profile ID is stored separately in localStorage and loaded on app start. Functions that read/write data always operate on the active profile's keys. Profile selection happens *after* the login gate — see [Boot sequence](#boot-sequence).

### Key constants (hardcoded in JS)

- `GRADES` — 23 climbing grades from `'4'` to `'8b+'`
- `GRADE_COLORS` — a **separate parallel array** of 23 hex colors, indexed by grade position. The colors are not properties on the grade entries; look them up with `GRADE_COLORS[GRADES.indexOf(g)]`. Adding a grade means adding a color at the same index.
- `CHART_TICK_COLOR` (`'#888'`) — use this for every Chart.js tick label. The older `#666`/`#555` values failed WCAG contrast against the dark chart surface.
- `TYPES` — 9 route types (Slab, Verticaal, Overhang, etc.)
- `GRIPS` — 9 grip types for hangboard (Krim, Jug, Open hand, etc.)
- `PAGE_ORDER` — nav order, drives the page-slide direction

### Rendering pattern

All UI updates use direct `element.innerHTML = templateLiteralString` assignments. There is no virtual DOM or templating library. Modals/overlays are created dynamically and dismissed on background click.

### Charts

Five Chart.js instances — destroy with `.destroy()` before re-creating to prevent memory leaks (there is a central teardown that nulls all five on profile switch):

| Variable | Type | Canvas | Purpose |
|---|---|---|---|
| `chartH` | Line | `#chart-hang` | Hangboard hang time progression |
| `tliChart` | Bar | (dynamic) | Training Load Index per week |
| `chartP` | Line | `#chart-progress` | Max grade per session (clickable) |
| `chartG` | Bar | `#chart-grades` | Routes per grade (completed) |
| `stokeRadarChart` | Radar | (dynamic) | Stroke type distribution (Coach page) |

All tick labels use `CHART_TICK_COLOR`.

### Session editing

Uses two globals: `editMode` (boolean) and `editSessionId` (string). The save form function checks these to decide whether to insert or update a record.

### Draft autosave

The log form autosaves so a half-entered session survives a reload or an accidental navigation:

- `_saveDraftDebounced()` → `saveDraft()` writes to `flagit_log_draft_v1_{pid}`
- `restoreDraftIfAny()` on load, surfaced via `showDraftBanner()` / `hideDraftBanner()`
- `discardDraft()` clears it; `_isLogFormBlank()` avoids saving empty drafts

`saveDraft()` is deliberately a **silent** save — no toast (see [Feedback states](#ux-improvements)). Navigating away from a partly filled log page is separately guarded by `showNavLeaveConfirm()`.

### Generated content (seeded RNG)

Two features generate narrative text client-side from a deterministic PRNG, so the same input always produces the same output (no API calls, no randomness across reloads):

- **Engine:** `_seededRand(seedStr)` (FNV-1a hash → mulberry32), plus `_pick(arr, rand)`, `_shuffle(arr, rand)` and `_seedFor()`.
- **Klimverhaal** (session stories): `computeStorySignals()` → `generateSessionStory()` → `showStoryModal()`, with `_setStoryTone()`, `_shuffleStory()` and `_shareStory()`. Reachable from the feed card and the session detail modal.
- **Project Quest Lore**: `computeLoreSignals()` → `generateProjectLore()` → `showProjectLoreModal()`. Results are cached in `projectLoreCache`; `regenerateProjectLore()` bumps a stored `nonce` to reroll, and deleting a project clears its cache entry.

Both write into the DOM, so the i18n observer covers them — but the `navigator.share` payloads they produce do not (see below).

### Klimkaart share card (canvas)

`generateShareCard()` draws a shareable PNG on a `<canvas>` via `ctx.fillText`, then `downloadShareCard()` / `shareShareCard()` save or share it (`navigator.share` with a `File`).

The FLAG/IT wordmark is two `fillText` calls so the halves can differ in color; `IT` is positioned with `32 + ctx.measureText('FLAG').width`. Do not reintroduce a hardcoded x-offset — the font stack is `Impact, Arial Black, sans-serif`, and a value tuned for Impact overlaps the letters on every device that falls back.

**Canvas text is invisible to the i18n MutationObserver.** Every label drawn with `fillText` must branch on `currentLang` (or go through `i18nTranslate()`) explicitly — e.g. the grade-pyramid heading does `currentLang==='en'?'GRADE PYRAMID':'GRADE PYRAMIDE'`. This is the most common way a string ends up untranslated for English users.

### Marketing attribution

`captureMarketingParams()` is an IIFE that runs **before the i18n init** near the top of the `<script>` block. It:

- persists `?utm_source=…` to `flagit_signup_source_v1` (first write wins),
- writes `?lang=en` / `?lang=nl` to `flagit_lang_v1` so marketing links deep-link into either language,
- calls `history.replaceState` to strip the query string from the URL.

Anything that reads `?lang=` must run after this IIFE — the ordering is load-bearing, not incidental.

### Internationalization (i18n)

The app supports **English (default) and Dutch**, chosen via a toggle in Meer → Language / Taal. Rather than threading a `t('key')` call through every one of the ~250 `render*()` functions, translation happens as a **live DOM pass**, defined near the top of the `<script>` block in `index.html` (right after the `GRADES`/`TYPES`/`GRIPS` constants).

**Two directions that are easy to confuse:** English is the *default UI language*, but Dutch is still the *source language in the code*. Every string is authored in Dutch and translated to English at runtime — so "English is the default" means the translation layer runs for nearly every user, not that the source was rewritten.

- `currentLang` (`'en'`|`'nl'`) is read from `localStorage['flagit_lang_v1']` at load time, **defaulting to `'en'`** when no choice has been stored. `setLang(lang)` persists the choice and calls `location.reload()` — a full reload is the simplest way to safely re-render everything in the new language. A user who explicitly picked Dutch keeps it; only users with no stored preference get English.
- A `?lang=en` / `?lang=nl` query param (handled by `captureMarketingParams()`, which runs *before* the i18n init) writes the preference on first load, so marketing links can deep-link into either language.
- `initI18nObserver()` also mirrors `currentLang` onto `document.documentElement.lang`; the static `<html lang="en">` attribute and `manifest.json` (`lang`, `description`, shortcut names) are English, since neither is reachable by the DOM observer.
- `LOCALE()` returns `'en-US'`/`'nl-NL'` for use in `toLocaleDateString`/`toLocaleString` calls (`fmtDate`, `dateBucket`, etc.) so dates/weekdays/months localize correctly.
- `I18N_PATTERNS` (regex → replacement) and `I18N_PHRASES` (plain NL substring → EN substring, sorted longest-first) together define the translation. `i18nTranslate(str)` applies patterns then phrases; it is a no-op when `currentLang !== 'en'`. `I18N_PHRASES` is now ~490 pairs and occupies a single large literal — new entries go inside that block.
- `translateSubtree(node)` walks text nodes plus `placeholder`/`title`/`aria-label` attributes, only writing back when the translated value actually differs (writing back an unchanged value would re-trigger the observer below and loop).
- A single `MutationObserver` on `document.body` (installed once via `initI18nObserver()`) calls `translateSubtree` on every added/changed node when `currentLang === 'en'`. Because every `render*()` function already works by reassigning `innerHTML`, this one observer transparently covers all current and future dynamic content — no per-function changes needed.
- The observer only sees `document.body`. Text that never lands in the DOM — `navigator.share({title,text})` payloads, canvas `ctx.fillText()` labels, `alert()` — must be translated explicitly with `i18nTranslate()` or branched on `currentLang`. Prefer `toast()` over `alert()` for exactly this reason. When translating a string that embeds user content (a session note, a gym name), translate the surrounding parts separately so the user's own text is left alone — the DOM equivalent is the `data-no-i18n` attribute.
- Since NL is the untouched source language, adding a new Dutch string needs **no code change** for Dutch. To make it appear in English — which is what nearly every user sees — add an `['Dutch phrase','English phrase']` entry to `I18N_PHRASES` (or a regex to `I18N_PATTERNS` if the string has interpolated values). Prefer the longest, most specific phrase that makes sense — the sort-by-length means longer entries are substituted before shorter/generic ones, avoiding accidental partial-word matches (e.g. `'Wisselen'` must have its own entry so the generic `'Wis'→'Clear'` rule doesn't mangle it into `'Clearselen'`).

### Finding functions

With ~250 functions in a single file, use grep/search to locate them by name. Functions are grouped loosely by feature area in the script block:

i18n → profile management → data persistence → feed rendering → log form + draft autosave → goals → quick-top → hangboard + timers → stats/heatmap/pyramid/TLI → session stories (Klimverhaal) → projects + Quest Lore → backup/import → competitions → tab switching → diary → injuries/finger health → stroke radar → share card → coach + nudges → ads/admin → boot → rival mode → rest timer → route setter grid → extras (`fireShakedown`, `replaySession`, `applyVibe`, `renderStreakReaper`, `renderGradeOracle`)

Feature areas that are easy to miss because they have no page of their own:

| Area | Entry points |
|---|---|
| Route setter grid | `openSetterModal()`, `renderSetterGrid()`, `toggleSetterCell()`, `saveFromSetter()`, `applySetterToProject()`, `viewProjectSetter()` |
| Rival mode | `importRival()`, `clearRival()`, `getRivalRoutes()`, `getRivalStats()`, `renderRivalSection()` |
| Coach nudges & prompts | `renderPlateauBanner()`, `renderNudges()`, `renderQuietTime()`, `renderWeaknessDetector()`, `renderStreakReaper()`, `renderGradeOracle()`, `renderOnThisDay()` |
| Timers | `toggleTimer()` (hangboard), `toggleSessHangTimer()` (in-session hang), `toggleSessionTimer()` (session clock), `toggleRestTimer()` (rest) |
| Gestures / PWA shell | `initSwipeNav()`, `initPullToRefresh()`, `initInstallPrompt()`, `haptic()` |

## Conventions

- **XSS protection:** User-supplied strings must be HTML-escaped before insertion into `innerHTML`. The utility is **`esc()`** in `index.html`. There is no `escHtml()` — writing one from memory has already shipped a crash bug once. `social.js` is a separate file and uses its own `_s()` helper.

  The two are **not** interchangeable: `_s()` also escapes `'` as `&#39;`, `esc()` does not. That matters because inline `onclick="fn('${…}')"` handlers put the value inside a single-quoted JS string, where an unescaped apostrophe breaks out — the bug fixed in `e0adff0` (XSS via username in onclick handlers). Rule of thumb: `esc()` is fine for text content and double-quoted attributes; anything interpolated into a single-quoted inline handler argument needs `'`-escaping too. Prefer passing an id into the handler and looking the record up, rather than interpolating user text at all.
- **Product name is `FlagIt`** — one word, capital F and I, no space and no hyphen. Use it in all user-visible copy, titles, alt text and docs. Three things keep the older spellings and must **not** be renamed:
  - `flagit_*` localStorage keys and the `flagit-vNN` cache name — renaming these orphans every existing user's data.
  - `/Flag-It/` in `manifest.json` (`start_url`, `scope`, icon paths) and the Pages URL — that is the **repository** name, not the product name.
  - `@flagit.app` and the `flagit-backup-*` / `flagit-klimkaart-*` download filenames — lowercase slug convention.

  The two-tone wordmark is `Flag<span>It</span>` (the span carries the accent color; CSS uppercases it to FLAGIT). On the share-card canvas the same wordmark is two `fillText` calls, positioned with `measureText` rather than a hardcoded offset — see [Klimkaart share card](#klimkaart-share-card-canvas).
- **Mobile-first:** The layout targets max-width 430px. Use CSS `env(safe-area-inset-*)` for fixed bottom elements.
- **English UI, Dutch source strings:** All source strings (HTML markup + JS template literals) are written in Dutch — keep new strings in Dutch. English is a runtime translation layer on top (see [Internationalization (i18n)](#internationalization-i18n)). Because English is the **default** language, a new Dutch string with no `I18N_PHRASES` entry is visible Dutch text for nearly every user — so adding the entry is required, not optional. Text that never reaches the DOM (`navigator.share` payloads, canvas `fillText`, `alert()`) is not covered by the observer and must call `i18nTranslate()` explicitly, or branch on `currentLang`.
- **PWA offline:** All new static assets must be listed in the `sw.js` cache array and the cache version bumped. CI enforces this for the four core files.
- **No build system** — keep app logic self-contained; avoid introducing npm dependencies or build tools in `index.html` / `cloud.js` / `social.js`. (`marketing/` is separate tooling and exempt.)
- **Cloud-aware mutations:** If a data mutation should sync to Supabase, the save function marks the table dirty and schedules a push after writing to localStorage — `cloudMarkDirty(table, activeProfileId)` then `cloudScheduleSync(activeProfileId)`, both behind a `typeof cloudMarkDirty === 'function'` guard so the app still works when `cloud.js` fails to load.

## Extending the App

FlagIt is actively developed — new features and pages are welcome. Follow these patterns:

### Adding a new page

Prefer a **subtab on an existing page** over a new top-level page — the nav is deliberately capped at 5 tabs (see [Navigation consolidation](#navigation-consolidation--done)). If a genuinely daily-use feature warrants its own page:

1. Add `<div id="page-newname" class="page">` in the HTML markup section
2. Add a nav/button that calls `showPage('newname')` — the short id, without the `page-` prefix
3. Add `'newname'` to `PAGE_ORDER` so the slide-direction animation works
4. Implement render + init functions in the script block, grouped near related features
5. If the page needs its own data, add a localStorage key following the `flagit_<name>_v1_{profileId}` pattern — see [Adding a new data collection](#adding-a-new-data-collection)

### Adding a feature to an existing page

1. Grep for a nearby function to find the right section in the script block
2. Add new functions there, following the mutation pattern: mutate array → call save function
3. Render new UI via `innerHTML` template literals or add static HTML to the page's `<div>`
4. Always escape user input with `esc()` before inserting into the DOM
5. Add `I18N_PHRASES` entries for every new Dutch string

### Adding a new data collection

Collections do **not** get their own loader — there is one shared `loadArr(key, fallbackKey)` helper, and the profile-scoped key strings all come from `profileStorageKeys(id)`. Four steps:

1. Add the key to `profileStorageKeys()`:
   ```js
   ntk: 'flagit_newthings_v1_' + id
   ```
2. Declare the global array and its key variable alongside the existing ones (`let newThings = [];`, and `NTK` on the `let SK=…, GYK=…` line).
3. Write only a save function, mirroring `saveProjects()`:
   ```js
   function saveNewThings(){
     try{ localStorage.setItem(NTK, JSON.stringify(newThings)); }
     catch(e){ toast('Opslaan mislukt','#e53935'); }
     if(typeof cloudMarkDirty==='function'){ cloudMarkDirty('new_things', activeProfileId); cloudScheduleSync(activeProfileId); }
   }
   ```
   Drop the `cloudMarkDirty`/`cloudScheduleSync` lines if the collection is local-only — `saveProjectLore()` is the precedent, and its comment explains why Quest Lore deliberately stays out of the cloud (`_toRow()` spreads the whole project object, so an ad-hoc field would break the upsert without a schema migration).
4. In the profile-load flow inside `selectProfile()`, point the key at the profile namespace (`NTK = keys.ntk;`) and load it next to the others (`newThings = loadArr(NTK);`).

If the data should sync to Supabase, also add a table to `supabase_schema.sql` (with RLS) and wire it into `_pushTable`/`_pullTable` and the synced-tables list in `cloud.js`.

## Optimization Guidelines

These guidelines exist to streamline the PWA — no new features, only improving what's already there.

### Navigation consolidation — done

The nav went from 8 tabs down to **5**: Feed · Loggen · Analyse · Doelen · Meer. Coach is a subtab of Analyse, Hangboard and Gyms are merged into Meer, Projecten is a subtab of Doelen, and Sociaal is a subtab of Feed. See the [Pages table](#pages-bottom-nav) for the current structure. Nothing further is needed here — add new subtabs with the same `switch*Tab()` pattern rather than new top-level pages, unless a feature genuinely earns daily use.

### Visual consistency

Use only these values — no exceptions for new or changed styles.

**Spacing scale:**
- `8px` — space inside a component (e.g. icon + label)
- `12px` — standard `margin-bottom` between cards
- `16px` — card `padding`, space between sections
- `20px` — space between page sections
- `24px` — top margin of a page

**Border radius (3 fixed sizes):**
- `12px` — buttons, inputs, chips
- `14px` — cards (`.goal-card`, `.project-card`, `.hang-card`, `.comp-card`, etc.)
- `16px` — modals, bottom sheets

**Button font sizes (2 sizes):**
- `14px` — secondary/utility buttons
- `17px` — primary action buttons (`.btn-save`, `.btn-add-*`)

**CSS consolidation — done:**

1. ✅ `.card-base` exists and carries the shared card declarations; `.goal-card`, `.project-card`, `.comp-card` and `.hang-card` are rendered as `class="card-base <type>-card"` and keep only their real differences (`.hang-card`: no padding, `overflow:hidden`, slower animation).
2. ✅ A single `.btn-delete` class replaces the five old delete-button rules; `.btn-ps-delete` and `.btn-delete-project` remain as thin modifiers on top of `.btn-delete`.
3. ✅ `margin-bottom` on all cards is `12px` (via `.card-base`).

The broader spacing/radius/font normalization (every value outside the cards and delete buttons) was deliberately **not** done in one sweep — apply the scale above when you touch the relevant lines.

### UX improvements

**Tab-switching pattern — done:**

A single generic `switchTab(prefix, tabs, active)` does the button/panel work via the id convention `tab-{prefix}-{name}` (button) / `{prefix}-tab-{name}` (panel). The five `switch*Tab()` functions remain as thin wrappers that set the state variable and trigger per-tab render side effects. For new subtabs: follow the id convention and call `switchTab` from a wrapper.

**Feedback states — done:**

- `.is-loading` (in CSS) is applied to every button that starts a network round-trip: auth flows (both screens), kudos, follow/unfollow, posting a comment, sending feedback. New async buttons follow the same pattern.
- Toast audit: every `save*()` function toasts `'Opslaan mislukt'` on a localStorage error, and every user action gives feedback (a toast, or visible navigation/re-render). Deliberate choice: **no** success toast inside the low-level save functions themselves — backup-restore and delete flows call several saves in a row and already show their own feedback; a toast per save would spam. `saveDraft()` stays a silent autosave.

**Empty states — done:**

Every `render*()` function that shows a list renders an `.empty-state` block for an empty array (feed, gyms, goals, hangboard, projects, diary, competitions, injury log, reset section). Keep this up for new lists:

```js
if (!items.length) {
  el.innerHTML = '<div class="empty-state">Nog niets hier.</div>';
  return;
}
```

**Quick-log shortcut — done:**

The quick-action row on Home (`.home-qa-btn` — "+ Sessie loggen" / "⚡ Snel toppen") and the `.quick-top-sheet` pattern (`openQuickTop()`) are present and visible on the Home page.

### Code consolidation patterns

Apply these patterns when you touch the relevant code — no large-scale refactor in one go.

**Delete functions — done:** every delete flow uses `deleteItem(arr, id, saveFn, renderFn)` (splice in place → save → render) and the shared confirmation modal `showDeleteConfirm(title, sub, onConfirm)`. Use both for new delete flows. Known exception: `deleteGoal` deletes without a confirmation — left that way on purpose until the product owner decides whether goals deserve a confirm too.

**Card rendering:** every `render*()` function builds HTML via template literals. The outermost wrapper always uses the base class + type modifier (e.g. `class="card-base goal-card"`), never separate conflicting styles.

**Dirty tracking after mutations:** the `save*()` function itself calls `cloudMarkDirty(table, activeProfileId)` + `cloudScheduleSync(activeProfileId)` when the table syncs to Supabase — callers only call `save*()`, they never mark dirty by hand.
