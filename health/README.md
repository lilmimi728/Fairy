# Pulse — health, training & weekly accountability

One place for your Oura and Apple Health data and your workouts. Every week it
tells you plainly how last week went.

- **Today**: your scheduled routine, live progress on this week's commitments, and
  sleep, readiness, HRV, resting HR, steps and calories with 14-day trends.
- **Train**: build routines (exercises, sets, reps, weight) and assign them to days
  of the week. Log workouts set by set; it shows what you lifted last time. Workouts
  recorded on your Watch or ring show up in history too, without double counting.
- **Review**: every Monday it reviews the week that just ended.
  - Commitments you made are graded first: kept or broken.
  - Planned sessions are checked against what you did: done, moved or skipped, by day.
  - Each daily goal shows how many days you hit it, compared with the week before.
  - It flags recovery signals (HRV, resting HR, readiness) and patterns, such as
    short nights lowering readiness or weekend slumps.
  - It ends by suggesting measurable commitments for this week, which get graded
    next Monday.
  - Optional: Claude writes you a short coach's check-in from the same numbers.
- **Settings**: connect Oura, import Apple Health, set goals, back up your data.

Everything is stored **on your device** and there is no server. No build step: plain
HTML, CSS and JavaScript modules.

## Run it

```sh
cd health
npm start        # serves http://localhost:8080
npm test         # node's built-in test runner, no dependencies
```

Try it with fake data first: open the app and tap **Explore with sample data**.

## Put it on your phone

1. Host the `health/` folder over HTTPS. GitHub Pages works: repo **Settings → Pages**,
   deploy from this branch, and the app is at `https://<you>.github.io/<repo>/health/`.
2. Open that URL in Safari → Share → **Add to Home Screen**. It runs full-screen and
   works offline.

## Connect your data

**Oura.** Oura no longer offers personal tokens, so Pulse uses Oura's browser
sign-in (no server needed):

1. Create an application at <https://cloud.ouraring.com/oauth/applications>.
2. Set its redirect URI to the exact URL where Pulse is hosted (Settings shows it).
3. Paste the client ID into Settings → Oura and tap **Connect**. Tokens last 30 days.
   After that, tap Reconnect.

If sync reports a CORS error, deploy the small relay in [`proxy/`](proxy/README.md).

**Apple Health.** Browsers can't read HealthKit directly, so you import an export:
Health app → profile picture → **Export All Health Data** → save to Files → Settings →
**Choose export.zip**. Pulse streams the file, so multi-gigabyte exports work. It keeps
steps, active energy, exercise minutes, sleep, resting HR, HRV, weight and workouts.
Re-import whenever you like; newer data replaces older data.

**AI coach (optional).** Paste an Anthropic API key in Settings. It stays on your
device, and only the week's computed summary goes to Claude, only when you tap
**Ask Claude**.

## How the data is merged

| Metric | Preferred source |
| --- | --- |
| Sleep, readiness, HRV, resting HR, bedtime | Oura (worn overnight), else Apple Health |
| Steps | whichever source counted more |
| Active calories, exercise minutes, weight | Apple Health, else Oura |

Phone and Watch both record steps, so for each day Pulse takes the larger source
rather than adding them together.

## Code map

| File | What it does |
| --- | --- |
| `js/review.js` | Weekly accountability engine: statements, grading, suggestions |
| `js/training.js` | Planned vs. completed sessions, workout de-duplication |
| `js/metrics.js` | Metric catalogue, source merging, formatting |
| `js/oura.js` | Oura sign-in and sync |
| `js/apple-health.js` | Streaming Apple Health zip/XML import |
| `js/coach.js` | Optional Claude check-in |
| `js/store.js` | On-device storage; the one place to swap in a cloud backend |
| `js/app.js` | Screens and interactions |
| `css/app.css` | All styling; colours and radii are tokens at the top |

## Road to a native iOS app

The plan is to wrap this same code with [Capacitor](https://capacitorjs.com) rather
than rewrite it:

1. `npm i @capacitor/core @capacitor/ios` and add a HealthKit plugin. Write a
   `healthkit.js` source that returns the same `{ days, workouts }` shape as
   `apple-health.js`. Apple Health then syncs live, with no export.
2. Point the Oura redirect at a custom URL scheme.
3. Build in **Xcode** on a Mac. A free Apple ID can install it on your own phone
   (it re-signs every 7 days). The $99/year developer program gives you TestFlight.

If you later want data synced across devices, or a review pushed to you every
Monday, add a backend such as Supabase behind `js/store.js`.
