# Flag It — Instagram launch series

A 3-post launch set for Instagram. Everything is 1080 × 1080 and shares one
brand system: the app's own palette, the app's own typeface, and the logo
lockup pinned to the same spot on every graphic.

| # | Post | Files (`out/`) |
|---|---|---|
| 1 | Launch announcement | `post-1-launch.png` |
| 2 | Screenshot showcase | `post-2-showcase.png` |
| 3 | Add to Home Screen (4-slide carousel) | `post-3-slide-1-cover.png` → `post-3-slide-4-done.png` |

Each file also exists in a Dutch variant with a `.nl` suffix
(`post-1-launch.nl.png`, …). Post the language that matches your audience —
the app itself ships NL by default with an EN toggle, so both are live copy.

---

## Brand system

Pulled straight from `index.html` so the posts and the product match exactly.

| Token | Value | Where it comes from |
|---|---|---|
| Background | `#0a0a0a` | `:root --bg` |
| Accent (purple) | `#7f77dd` | `:root --accent` |
| Accent light | `#afa9ec` | `:root --accent2` |
| Text | `#f5f5f5` | `:root --text` |
| Success / flash | `#4caf50` / `#ffc107` | `:root --success` / `--flash` |
| Deep hero gradient | `#1c1650 → #100d2a → #0c0b1a → #0a0a0a` | `.hero-stats` |
| Display type | Barlow Condensed 800, uppercase | `.ss-title`, `.page-title` |
| Body type | Barlow 400–600 | `body` |

**Logo placement is fixed:** icon + `FLAG` (white) `IT` (purple) at 72 px from
the top-left on every single graphic, matching the app's own start screen
lockup. The footer handle sits at 72 px from the bottom-left. Don't move
these between posts — the repetition is what makes the set read as a series.

The backgrounds are **generated, not photographed**: `kit.js` draws a
bouldering wall (angled panels, T-nut grid, organic holds coloured from the
app's own `GRADE_COLORS`). That keeps the set licence-free. If you have a
climbing action shot you own the rights to, drop it in as an `<img>` behind
`.wall-shade` in `post-1-launch.html` — the dark gradient overlay is already
tuned to keep the headline legible over a photo.

---

## Captions

Swap `LINK` for your live URL. The app already parses UTM parameters
(`captureMarketingParams()` in `index.html`), so tagging the link means signup
source shows up in your own data:

```
https://toobrouwers-dot.github.io/Flag-It/?utm_source=instagram
```

Add `&lang=en` to that link when you post the English set — the app will open
in English on first load.

> Heads-up: that URL is derived from the Pages workflow plus the manifest
> `scope` (`/Flag-It/`). Confirm it resolves before it goes in the bio, and
> swap in a custom domain if you have one.

### Post 1 — Launch

**EN**
> Flag It is live 🚀
>
> A free bouldering + hangboard tracker built for the wall, not the desk.
> Log your routes between attempts, watch your grade curve climb, and set
> goals you'll actually chase.
>
> · Log sessions in seconds
> · Grade + flash PRs tracked automatically
> · Hangboard timer and training load
> · Works offline, syncs when you're back on wifi
>
> No app store. No paywall. Link in bio.
>
> #bouldering #klimmen #climbingtraining #hangboard #boulderen #climbinglife #sendit #pwa

**NL**
> Flag It is live 🚀
>
> Een gratis boulder- en hangboardtracker, gemaakt voor aan de muur — niet
> voor achter je bureau. Log je routes tussen de pogingen door, zie je
> graadcurve stijgen en stel doelen die je écht najaagt.
>
> · Sessies loggen in seconden
> · Top- en flash-PR's automatisch bijgehouden
> · Hangboardtimer en trainingsbelasting
> · Werkt offline, synct zodra je weer wifi hebt
>
> Geen app store. Geen paywall. Link in bio.
>
> #boulderen #klimmen #klimhal #hangboard #bouldering #climbingtraining #sendit

### Post 2 — Screenshot showcase

**EN**
> See your progress at a glance 📈
>
> Every route you log feeds the analysis page. Max grade per session,
> personal records, routes per grade, weekly training load — all of it
> builds itself while you climb.
>
> The screenshots are real: 24 sessions, 174 routes, 6a → 7b over four
> months. That curve is the whole point.
>
> Link in bio.
>
> #climbingprogress #bouldering #trainingforclimbing #climbingdata #boulderen

**NL**
> Je voortgang in één oogopslag 📈
>
> Elke route die je logt voedt de analysepagina. Max graad per sessie,
> persoonlijke records, routes per graad, trainingsbelasting per week — het
> bouwt zichzelf op terwijl jij klimt.
>
> De screenshots zijn echt: 24 sessies, 174 routes, 6a → 7b in vier maanden.
> Om die curve is het te doen.
>
> Link in bio.
>
> #klimmen #boulderen #klimtraining #progressie #climbingdata

### Post 3 — Add to Home Screen (carousel)

**EN**
> Make it feel like a real app 📲 (swipe)
>
> Flag It is a web app, so there's nothing to download — but two taps put it
> on your home screen with its own icon, full-screen, no browser bars.
>
> iPhone: open it in Safari → Share → Add to Home Screen
> Android: open it in Chrome → ⋮ → Add to Home screen
>
> Once it's there it caches itself, so it still works in the basement gym
> with no signal.
>
> Link in bio 👆
>
> #pwa #bouldering #climbingapp #boulderen #klimmen

**NL**
> Laat het voelen als een echte app 📲 (swipe)
>
> Flag It is een web-app, dus er valt niets te downloaden — maar met twee
> tikken staat hij op je beginscherm, met eigen icoon en schermvullend,
> zonder browserbalken.
>
> iPhone: open in Safari → Deel → Zet op beginscherm
> Android: open in Chrome → ⋮ → Toevoegen aan startscherm
>
> Daarna cachet hij zichzelf, dus hij werkt ook in die kelderhal zonder
> bereik.
>
> Link in bio 👆
>
> #pwa #boulderen #klimmen #klimhal #climbingapp

---

## Posting order

Post 1 → Post 2 (1–2 days later) → Post 3 (2–3 days later). Post 3 is the
one worth pinning: it converts profile visitors into installs, and it stays
useful long after launch week.

---

## Re-rendering

Requires Node with `playwright` available (the repo itself stays
dependency-free — this is a build-time tool only, nothing here ships to
users).

```bash
cd marketing/instagram-launch

# 1. Refresh the in-app screenshots used by post 2 (optional)
node build/capture-app.js              # English UI
node build/capture-app.js --lang nl    # Dutch UI

# 2. Render the posts
node build/render.js                   # English set  → out/*.png
node build/render.js --lang nl         # Dutch set    → out/*.nl.png
node build/render.js --only post-2     # just one template
```

`build/capture-app.js` serves the repo on a throwaway port, seeds a
deterministic demo profile into `localStorage` (24 sessions, 174 routes,
6a → 7b), walks the app and writes phone screenshots into `src/screens/`. It
never writes to the repo's own files and never touches a real Supabase
project — the Supabase SDK is stubbed during capture.

### Editing copy

All headline/body strings live in a `window.COPY = { en: {...}, nl: {...} }`
block at the bottom of each template, keyed to `data-c` attributes in the
markup. Change the string, re-render. Adding a language means adding a third
key and passing `--lang <key>`.

---

## Notes for whoever picks this up next

- **These files are not app assets.** Don't add `marketing/**` to the `sw.js`
  cache array — the service worker should keep caching only what users
  actually load.
- The browser menus on slides 2 and 3 are stylised, generic representations of
  the Safari share sheet and the Chrome overflow menu. They're recognisable
  without copying Apple's or Google's UI pixel for pixel, and the app icons on
  slide 4 are blank placeholders rather than real third-party brands.
- Rendering is deterministic: the wall layout, the hold placement and the demo
  data all run off fixed seeds, so a re-render produces the same image.
- **Small bug spotted while capturing:** in English, a feed card's meta line
  (`Wed, Jul 29 · 8 routes · ⏱ 73:00`) wraps into a narrow column next to the
  max-grade badge, because the English date format is wider than the Dutch one.
  Dutch renders fine. Worth a look in `renderFeed()` if you want the English
  feed to photograph as well as the Dutch one — it's why post 2 uses the
  Analysis and Log screens rather than the feed.
- Session durations render as `mm:ss` (`73:00` = 73 minutes) via `fmtSecs()`.
  Reads a little oddly past an hour, but it's existing app behaviour, left
  as-is.
