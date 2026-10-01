import { getState, update, subscribe, mergeDays, mergeWorkouts, exportBackup, importBackup, resetAll, uid } from './store.js';
import { dayKey, addDays, weekStart, lastCompleteWeekStart, range, formatDay, formatWeekRange, WEEKDAY_SHORT, weekdayIndex } from './dates.js';
import { METRIC_BY_ID, resolveRange, resolveDay, mean, formatMetric } from './metrics.js';
import { allWorkouts, routinesForDay, lastPerformance, sessionVolume } from './training.js';
import { buildWeeklyReview, commitmentProgress, describeCommitment } from './review.js';
import { startOuraLogin, consumeOuraRedirect, syncOura } from './oura.js';
import { importAppleHealth } from './apple-health.js';
import { sparkline, meter } from './charts.js';
import { buildDemoData } from './demo.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const toastEl = document.getElementById('toast');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => dayKey();
const units = () => getState().settings.units;
const fmt = (id, v) => formatMetric(id, v, { units: units() });
const TONE_ICON = { good: '✓', warning: '!', critical: '✕', neutral: '•' };

let ui = { busy: null, progress: null, routineDraft: null, coachLoading: false, error: null };

function toast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (toastEl.hidden = true), ms);
}

// ---------------------------------------------------------------- routing

function route() {
  const [name = 'today', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, args };
}

function go(path) {
  location.hash = `#/${path}`;
}

function render() {
  const { name, args } = route();
  const views = { today: viewToday, train: viewTrain, routine: viewRoutine, session: viewSession, review: viewReview, settings: viewSettings };
  const view = views[name] || viewToday;
  app.innerHTML = view(...args);
  const tab = { routine: 'train', session: 'train' }[name] || name;
  for (const a of nav.querySelectorAll('a')) a.classList.toggle('active', a.dataset.tab === tab);
  if (name === 'review') markReviewSeen(args[0]);
}

// ---------------------------------------------------------------- Today

function latestValue(id, maxAgeDays = 3) {
  const s = getState();
  for (let i = 0; i <= maxAgeDays; i++) {
    const k = addDays(today(), -i);
    const v = resolveDay(s.days[k])[id];
    if (v != null) return { key: k, value: v };
  }
  return null;
}

function deltaHtml(id, value, baseline) {
  if (value == null || baseline == null || !baseline) return '';
  const m = METRIC_BY_ID[id];
  const diff = value - baseline;
  const p = (diff / Math.abs(baseline)) * 100;
  if (Math.abs(p) < 1) return `<span class="delta">± same as 7-day avg</span>`;
  const good = m.better === 'none' ? null : (diff > 0) === (m.better === 'up');
  const cls = good == null ? '' : good ? 'up-good' : 'up-bad';
  return `<span class="delta ${cls}">${diff > 0 ? '▲' : '▼'} ${Math.abs(Math.round(p))}% vs 7-day avg</span>`;
}

function tile(id) {
  const s = getState();
  const latest = latestValue(id);
  const keys = range(addDays(today(), -13), 14);
  const series = resolveRange(s.days, keys).map((r) => r[id]);
  const baselineKeys = latest ? range(addDays(latest.key, -7), 7) : [];
  const baseline = mean(resolveRange(s.days, baselineKeys).map((r) => r[id]));
  const m = METRIC_BY_ID[id];
  const when = latest ? (latest.key === today() ? (id === 'sleepHours' ? 'last night' : 'today') : latest.key === addDays(today(), -1) ? 'yesterday' : formatDay(latest.key)) : 'no data';
  return `<div class="tile">
    <div class="tile-label">${m.label}<span class="muted"> · ${when}</span></div>
    <div class="tile-value">${latest ? fmt(id, latest.value) : '—'}</div>
    ${deltaHtml(id, latest?.value, baseline)}
    ${sparkline(series, { label: `${m.label}, last 14 days` })}
  </div>`;
}

function viewToday() {
  const s = getState();
  const t = today();
  const wk = weekStart(t);
  const reviewWeek = lastCompleteWeekStart(t);
  const hasAnything = Object.keys(s.days).length || s.sessions.length || s.routines.length;
  const reviewReady = hasAnything && !s.reviewsSeen[reviewWeek];

  const todays = routinesForDay(s, t);
  const doneIds = new Set(s.sessions.filter((x) => x.date === t).map((x) => x.routineId));
  const planHtml = s.activeSession
    ? `<button class="btn primary block" data-action="go" data-to="session">Resume ${esc(s.activeSession.name)}</button>`
    : todays.length
      ? todays
          .map(
            (r) => `<div class="row">
              <div><strong>${esc(r.name)}</strong><div class="muted small">${r.exercises.length} exercises</div></div>
              ${doneIds.has(r.id) ? '<span class="badge tone-good">✓ Done</span>' : `<button class="btn primary" data-action="start-routine" data-id="${r.id}">Start</button>`}
            </div>`,
          )
          .join('')
      : `<p class="muted">Rest day — nothing scheduled.</p>
         <div class="btn-row">${s.routines
           .filter((r) => !r.archived)
           .slice(0, 3)
           .map((r) => `<button class="btn" data-action="start-routine" data-id="${r.id}">${esc(r.name)}</button>`)
           .join('')}<button class="btn" data-action="start-empty">Empty workout</button></div>`;

  const commitments = commitmentProgress(s, wk, t);
  const commitHtml = commitments.length
    ? commitments
        .map(
          (c) => `<div class="row">
            <div>${esc(c.label)}<div class="muted small">${esc(c.result.detail)} so far</div></div>
            ${c.result.kept ? '<span class="badge tone-good">✓ Kept</span>' : '<span class="badge">In progress</span>'}
          </div>`,
        )
        .join('')
    : `<p class="muted">No commitments for this week. <a href="#/review">Set them from your weekly review →</a></p>`;

  // Week-to-date progress
  const sofar = range(wk, Math.min(7, weekdayIndex(t) + 1));
  const rows = resolveRange(s.days, sofar);
  const workoutsDone = allWorkouts(s, wk, addDays(wk, 6)).length;
  const sleepAvg = mean(rows.map((r) => r.sleepHours));
  const stepsAvg = mean(rows.map((r) => r.steps));
  const g = s.goals;
  const progress = `
    <div class="progress-item"><div class="row"><span>Workouts</span><strong>${workoutsDone} / ${g.workoutsPerWeek}</strong></div>${meter(workoutsDone, g.workoutsPerWeek)}</div>
    <div class="progress-item"><div class="row"><span>Avg sleep</span><strong>${fmt('sleepHours', sleepAvg)} <span class="muted">/ ${fmt('sleepHours', g.sleepHours)}</span></strong></div>${meter(sleepAvg, g.sleepHours)}</div>
    <div class="progress-item"><div class="row"><span>Avg steps</span><strong>${fmt('steps', stepsAvg)} <span class="muted">/ ${fmt('steps', g.steps)}</span></strong></div>${meter(stepsAvg, g.steps)}</div>`;

  const onboarding = !hasAnything
    ? `<section class="card highlight">
        <h2>Get started</h2>
        <ol class="steps">
          <li><a href="#/settings">Connect Oura</a> and <a href="#/settings">import Apple Health</a></li>
          <li><a href="#/train">Build your routines</a> and pick the days you'll do them</li>
          <li>Every Monday, open <a href="#/review">Review</a> to see how last week went and commit to this one</li>
        </ol>
        <button class="btn" data-action="load-demo">Explore with sample data</button>
      </section>`
    : '';

  return `
    <header class="page-head"><div><p class="eyebrow">${formatDay(t, { weekday: 'long', month: 'long', day: 'numeric' })}</p><h1>Today</h1></div></header>
    ${onboarding}
    ${reviewReady ? `<a class="card banner" href="#/review/${reviewWeek}"><strong>Your week in review is ready</strong><span>${formatWeekRange(reviewWeek)} — see how you did and set this week's commitments →</span></a>` : ''}
    <section class="card"><h2>Today's plan</h2>${planHtml}</section>
    <section class="card"><h2>This week's commitments</h2>${commitHtml}</section>
    <section class="card"><h2>Week so far</h2>${progress}</section>
    <h2 class="section-title">Body</h2>
    <div class="tiles">${['sleepHours', 'readiness', 'hrv', 'rhr', 'steps', 'activeCal'].map(tile).join('')}</div>
  `;
}

// ---------------------------------------------------------------- Train

function viewTrain() {
  const s = getState();
  const routines = s.routines.filter((r) => !r.archived);
  const history = allWorkouts(s, addDays(today(), -60), today()).reverse().slice(0, 25);
  const sourceLabel = { app: 'Logged', apple: 'Apple Health', oura: 'Oura' };
  return `
    <header class="page-head"><h1>Train</h1><button class="btn primary" data-action="new-routine">+ Routine</button></header>
    ${s.activeSession ? `<a class="card banner" href="#/session"><strong>Workout in progress</strong><span>${esc(s.activeSession.name)} — tap to resume →</span></a>` : ''}
    <h2 class="section-title">Routines</h2>
    ${
      routines.length
        ? routines
            .map(
              (r) => `<section class="card routine">
                <div class="row">
                  <div><h3>${esc(r.name)}</h3><div class="muted small">${r.days.length ? r.days.sort().map((d) => WEEKDAY_SHORT[d]).join(' · ') : 'Unscheduled'}</div></div>
                  <div class="btn-row"><button class="btn" data-action="go" data-to="routine/${r.id}">Edit</button><button class="btn primary" data-action="start-routine" data-id="${r.id}">Start</button></div>
                </div>
                <ul class="ex-list">${r.exercises.map((e) => `<li>${esc(e.name)} <span class="muted">${e.sets}×${esc(e.reps)}${e.weight ? ` @ ${esc(e.weight)}` : ''}</span></li>`).join('')}</ul>
              </section>`,
            )
            .join('')
        : `<section class="card"><p class="muted">No routines yet. Build one — e.g. “Upper A” on Mon & Thu — and the weekly review will track whether you show up for it.</p></section>`
    }
    <button class="btn block" data-action="start-empty">Start an empty workout</button>
    <h2 class="section-title">History</h2>
    <section class="card">
    ${
      history.length
        ? history
            .map((w) => {
              const session = w.source === 'app' ? s.sessions.find((x) => x.id === w.id) : null;
              const vol = session ? sessionVolume(session) : null;
              return `<details class="history-item">
                <summary><div><strong>${esc(w.name)}</strong><div class="muted small">${formatDay(w.date)}${w.minutes ? ` · ${w.minutes} min` : ''}${w.calories ? ` · ${w.calories} kcal` : ''}${vol ? ` · ${vol.sets} set${vol.sets === 1 ? '' : 's'}` : ''}</div></div><span class="badge">${sourceLabel[w.source] || w.source}</span></summary>
                ${
                  session
                    ? `<ul class="ex-list">${session.exercises
                        .map((e) => `<li>${esc(e.name)} <span class="muted">${e.sets.filter((x) => x.done).map((x) => `${esc(x.reps)}${x.weight ? `@${esc(x.weight)}` : ''}`).join(', ') || 'no sets'}</span></li>`)
                        .join('')}</ul>${session.notes ? `<p class="small">${esc(session.notes)}</p>` : ''}
                      <button class="btn danger small" data-action="delete-session" data-id="${session.id}">Delete</button>`
                    : `<p class="muted small">Imported from ${sourceLabel[w.source] || w.source}${w.sourceName ? ` (${esc(w.sourceName)})` : ''}.</p>`
                }
              </details>`;
            })
            .join('')
        : '<p class="muted">No workouts in the last 60 days.</p>'
    }
    </section>`;
}

function viewRoutine(id) {
  const s = getState();
  if (!ui.routineDraft || ui.routineDraft.id !== id) {
    const existing = s.routines.find((r) => r.id === id);
    ui.routineDraft = existing
      ? structuredClone(existing)
      : { id, name: '', days: [], exercises: [{ name: '', sets: 3, reps: '8', weight: '' }] };
  }
  const r = ui.routineDraft;
  const isNew = !s.routines.some((x) => x.id === id);
  return `
    <header class="page-head"><h1>${isNew ? 'New routine' : 'Edit routine'}</h1></header>
    <section class="card">
      <label class="field"><span>Name</span><input data-draft="name" value="${esc(r.name)}" placeholder="e.g. Upper A" autofocus></label>
      <div class="field"><span>Days</span><div class="chips">${WEEKDAY_SHORT.map((d, i) => `<button class="chip ${r.days.includes(i) ? 'on' : ''}" data-action="toggle-day" data-day="${i}" aria-pressed="${r.days.includes(i)}">${d}</button>`).join('')}</div></div>
    </section>
    <h2 class="section-title">Exercises</h2>
    ${r.exercises
      .map(
        (e, i) => `<section class="card ex-edit">
          <input class="ex-name" data-ex="${i}" data-field="name" value="${esc(e.name)}" placeholder="Exercise name">
          <div class="ex-grid">
            <label><span>Sets</span><input type="number" inputmode="numeric" min="1" data-ex="${i}" data-field="sets" value="${esc(e.sets)}"></label>
            <label><span>Reps</span><input data-ex="${i}" data-field="reps" value="${esc(e.reps)}" placeholder="8-10"></label>
            <label><span>Weight</span><input inputmode="decimal" data-ex="${i}" data-field="weight" value="${esc(e.weight)}" placeholder="optional"></label>
          </div>
          <div class="btn-row end">
            <button class="btn small" data-action="ex-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="btn small" data-action="ex-move" data-i="${i}" data-dir="1" ${i === r.exercises.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            <button class="btn small danger" data-action="ex-remove" data-i="${i}">Remove</button>
          </div>
        </section>`,
      )
      .join('')}
    <button class="btn block" data-action="ex-add">+ Add exercise</button>
    <div class="btn-row sticky-actions">
      ${isNew ? '' : '<button class="btn danger" data-action="routine-delete">Delete</button>'}
      <button class="btn" data-action="routine-cancel">Cancel</button>
      <button class="btn primary" data-action="routine-save">Save</button>
    </div>`;
}

function viewSession() {
  const s = getState();
  const a = s.activeSession;
  if (!a) return `<header class="page-head"><h1>No active workout</h1></header><a class="btn" href="#/train">Back to Train</a>`;
  const started = new Date(a.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `
    <header class="page-head"><div><p class="eyebrow">Started ${started}</p><h1>${esc(a.name)}</h1></div></header>
    ${a.exercises
      .map((e, i) => {
        const last = lastPerformance(s, e.name);
        return `<section class="card">
          <div class="row"><h3>${esc(e.name)}</h3>${e.target ? `<span class="muted small">Target ${esc(e.target)}</span>` : ''}</div>
          ${last ? `<p class="muted small">Last time (${formatDay(last.date)}): ${last.sets.map((x) => `${esc(x.reps)}${x.weight ? `@${esc(x.weight)}` : ''}`).join(', ')}</p>` : ''}
          <div class="set-head"><span>Set</span><span>Weight</span><span>Reps</span><span></span></div>
          ${e.sets
            .map(
              (set, j) => `<div class="set-row ${set.done ? 'done' : ''}">
                <span class="muted">${j + 1}</span>
                <input inputmode="decimal" data-set="${i}:${j}" data-field="weight" value="${esc(set.weight)}" placeholder="—">
                <input inputmode="numeric" data-set="${i}:${j}" data-field="reps" value="${esc(set.reps)}" placeholder="—">
                <button class="check ${set.done ? 'on' : ''}" data-action="set-toggle" data-i="${i}" data-j="${j}" aria-label="Mark set ${j + 1} done" aria-pressed="${set.done}">✓</button>
              </div>`,
            )
            .join('')}
          <button class="btn small" data-action="set-add" data-i="${i}">+ Set</button>
        </section>`;
      })
      .join('')}
    <button class="btn block" data-action="session-add-ex">+ Add exercise</button>
    <section class="card"><label class="field"><span>Notes</span><textarea data-session-notes rows="2" placeholder="How did it feel?">${esc(a.notes)}</textarea></label></section>
    <div class="btn-row sticky-actions">
      <button class="btn danger" data-action="session-discard">Discard</button>
      <button class="btn primary" data-action="session-finish">Finish workout</button>
    </div>`;
}

function startSession(routine) {
  const s = getState();
  if (s.activeSession && !confirm(`Discard the workout in progress (${s.activeSession.name})?`)) return;
  update((st) => {
    st.activeSession = {
      id: uid(),
      routineId: routine?.id || null,
      name: routine?.name || 'Workout',
      date: today(),
      startedAt: Date.now(),
      notes: '',
      exercises: (routine?.exercises || []).map((e) => {
        const last = lastPerformance(st, e.name);
        const n = Math.max(1, Number(e.sets) || 1);
        return {
          name: e.name,
          target: `${n}×${e.reps}${e.weight ? ` @ ${e.weight}` : ''}`,
          sets: Array.from({ length: n }, (_, k) => ({
            weight: e.weight || last?.sets[Math.min(k, last.sets.length - 1)]?.weight || '',
            reps: String(e.reps || '').split('-')[0],
            done: false,
          })),
        };
      }),
    };
  });
  go('session');
}

// ---------------------------------------------------------------- Review

function markReviewSeen(arg) {
  const wk = arg || lastCompleteWeekStart(today());
  if (!getState().reviewsSeen[wk]) update((s) => (s.reviewsSeen[wk] = Date.now()));
}

function viewReview(arg) {
  const s = getState();
  const t = today();
  const wk = arg || lastCompleteWeekStart(t);
  const current = weekStart(t);
  const inProgress = wk === current;
  const r = buildWeeklyReview(s, wk, t);
  const next = addDays(wk, 7);
  const canCommit = next === current;
  const existing = s.commitments[next] || [];
  const existingIds = new Set(existing.map((c) => `${c.kind}:${c.metric || ''}`));
  const note = s.coachNotes[wk];

  const metricsRows = r.metrics
    .map((m) => {
      const def = METRIC_BY_ID[m.id];
      let change = '—';
      if (m.deltaPct != null && def.better !== 'none' && m.id !== 'bedtime') {
        const good = (m.deltaPct > 0) === (def.better === 'up');
        change = Math.abs(m.deltaPct) < 1 ? '±0%' : `<span class="${good ? 'up-good' : 'up-bad'}">${m.deltaPct > 0 ? '▲' : '▼'} ${Math.abs(Math.round(m.deltaPct))}%</span>`;
      }
      return `<tr><th scope="row">${m.label}</th><td>${fmt(m.id, m.avg)}</td><td>${change}</td><td>${m.goal != null ? `${m.daysMet}/${m.daysWithData}` : '—'}</td></tr>`;
    })
    .join('');

  const statusText = { done: '✓ Done', moved: '↷ Moved', missed: '✕ Missed', upcoming: 'Upcoming' };
  const statusTone = { done: 'good', moved: 'warning', missed: 'critical', upcoming: '' };

  return `
    <header class="page-head">
      <div><p class="eyebrow">Weekly review${inProgress ? ' · in progress' : ''}</p><h1>${formatWeekRange(wk)}</h1></div>
      <div class="btn-row">
        <button class="btn small" data-action="go" data-to="review/${addDays(wk, -7)}" aria-label="Previous week">‹</button>
        <button class="btn small" data-action="go" data-to="review/${addDays(wk, 7)}" ${inProgress ? 'disabled' : ''} aria-label="Next week">›</button>
      </div>
    </header>

    <section class="card verdict tone-${r.verdict.tone}">
      <div class="verdict-score">${r.score.total ? `${r.score.met}<span>/${r.score.total}</span>` : '—'}</div>
      <div><h2>${TONE_ICON[r.verdict.tone]} ${r.verdict.title}</h2><p>${r.verdict.line}</p></div>
    </section>

    <section class="card">
      <h2>Accountability</h2>
      <ul class="statements">${r.insights.map((i) => `<li class="tone-${i.tone}"><span class="icon" aria-label="${i.tone}">${TONE_ICON[i.tone]}</span><span>${esc(i.text)}</span></li>`).join('') || '<li class="tone-neutral"><span class="icon">•</span><span>Nothing to report yet.</span></li>'}</ul>
    </section>

    <section class="card">
      <div class="row"><h2>Coach's take</h2>${s.settings.anthropicKey ? `<button class="btn small" data-action="coach" data-week="${wk}" ${ui.coachLoading ? 'disabled' : ''}>${ui.coachLoading ? 'Thinking…' : note ? 'Redo' : 'Ask Claude'}</button>` : ''}</div>
      ${note ? `<p class="coach">${esc(note.text).replace(/\n+/g, '<br><br>')}</p>` : s.settings.anthropicKey ? '<p class="muted">Get a written check-in from Claude based on these numbers.</p>' : '<p class="muted">Optional: add an Anthropic API key in <a href="#/settings">Settings</a> and Claude will write you a personal check-in each week.</p>'}
    </section>

    ${
      canCommit
        ? `<section class="card highlight">
            <h2>Commit for ${formatWeekRange(next)}</h2>
            ${existing.length ? `<ul class="statements">${existing.map((c, idx) => `<li class="tone-neutral"><span class="icon">→</span><span>${esc(describeCommitment(c, units()))}</span><button class="link" data-action="uncommit" data-week="${next}" data-idx="${idx}">remove</button></li>`).join('')}</ul>` : '<p class="muted">Pick what you will be held to next Monday. These are graded automatically.</p>'}
            <div class="suggestions">${r.suggestions
              .filter((c) => !existingIds.has(`${c.kind}:${c.metric || ''}`))
              .map((c) => `<button class="btn suggestion" data-action="commit" data-week="${next}" data-c='${esc(JSON.stringify(c))}'>+ ${esc(describeCommitment(c, units()))}</button>`)
              .join('')}</div>
          </section>`
        : ''
    }

    <section class="card">
      <h2>Training</h2>
      ${r.plan.length ? `<ul class="plan">${r.plan.map((p) => `<li><span>${WEEKDAY_SHORT[weekdayIndex(p.date)]} · ${esc(p.routineName)}${p.status === 'moved' ? ` <span class="muted">(done ${WEEKDAY_SHORT[weekdayIndex(p.doneOn)]})</span>` : ''}</span><span class="badge ${statusTone[p.status] ? `tone-${statusTone[p.status]}` : ''}">${statusText[p.status]}</span></li>`).join('')}</ul>` : '<p class="muted">No routines were scheduled this week.</p>'}
      <p class="small muted">${r.workouts.length} workout${r.workouts.length === 1 ? '' : 's'} total${r.workouts.length ? `: ${r.workouts.map((w) => esc(w.name)).join(', ')}` : ''}.</p>
    </section>

    <section class="card">
      <h2>Numbers</h2>
      ${r.metrics.length ? `<table class="table"><thead><tr><th></th><th>Avg</th><th>vs prior</th><th>Days at goal</th></tr></thead><tbody>${metricsRows}</tbody></table>` : '<p class="muted">No health data for this week.</p>'}
    </section>`;
}

// ---------------------------------------------------------------- Settings

function viewSettings() {
  const s = getState();
  const st = s.settings;
  const ouraConnected = st.ouraToken && st.ouraTokenExpires > Date.now();
  const goalField = (key, label, step) =>
    `<label class="field inline"><span>${label}</span><input type="number" step="${step}" min="0" data-goal="${key}" value="${esc(s.goals[key])}"></label>`;
  return `
    <header class="page-head"><h1>Settings</h1></header>
    ${ui.error ? `<div class="card error" role="alert">${esc(ui.error)}</div>` : ''}

    <section class="card">
      <div class="row"><h2>Oura</h2><span class="badge ${ouraConnected ? 'tone-good' : ''}">${ouraConnected ? `Connected until ${new Date(st.ouraTokenExpires).toLocaleDateString()}` : 'Not connected'}</span></div>
      ${st.ouraLastSync ? `<p class="muted small">Last synced ${new Date(st.ouraLastSync).toLocaleString()}</p>` : ''}
      <label class="field"><span>Oura app client ID</span><input data-setting="ouraClientId" value="${esc(st.ouraClientId)}" placeholder="from cloud.ouraring.com/oauth/applications" autocomplete="off"></label>
      <div class="btn-row">
        <button class="btn primary" data-action="oura-connect" ${st.ouraClientId ? '' : 'disabled'}>${ouraConnected ? 'Reconnect' : 'Connect Oura'}</button>
        <button class="btn" data-action="oura-sync" ${ouraConnected && !ui.busy ? '' : 'disabled'}>${ui.busy === 'oura' ? 'Syncing…' : 'Sync now'}</button>
        ${st.ouraToken ? '<button class="btn danger" data-action="oura-disconnect">Disconnect</button>' : ''}
      </div>
      <details><summary>Setup &amp; advanced</summary>
        <ol class="small">
          <li>Go to <a href="https://cloud.ouraring.com/oauth/applications" target="_blank" rel="noopener">cloud.ouraring.com/oauth/applications</a> and create an application.</li>
          <li>Set its redirect URI to exactly: <code>${esc(location.origin + location.pathname)}</code></li>
          <li>Paste the client ID above and tap Connect. Oura issues a 30-day token; reconnect when it expires.</li>
        </ol>
        <label class="field"><span>Proxy URL (only if sync is blocked by CORS)</span><input data-setting="ouraProxy" value="${esc(st.ouraProxy)}" placeholder="https://your-worker.workers.dev"></label>
        <label class="field"><span>Or paste an access token</span><input type="password" data-setting="ouraTokenManual" placeholder="access token" autocomplete="off"></label>
      </details>
    </section>

    <section class="card">
      <h2>Apple Health</h2>
      ${st.appleLastImport ? `<p class="muted small">Last imported ${new Date(st.appleLastImport).toLocaleString()}</p>` : ''}
      <p class="small">On your iPhone: <strong>Health</strong> → your profile picture → <strong>Export All Health Data</strong>. Save the zip to Files, then choose it here.</p>
      <label class="field inline"><span>Import the last</span><select id="apple-window"><option value="120">4 months</option><option value="365" selected>12 months</option><option value="0">Everything</option></select></label>
      <label class="btn primary file-btn ${ui.busy ? 'disabled' : ''}">${ui.busy === 'apple' ? `Importing… ${Math.round((ui.progress || 0) * 100)}%` : 'Choose export.zip'}<input type="file" accept=".zip,.xml,application/zip,text/xml" data-action="apple-file" hidden ${ui.busy ? 'disabled' : ''}></label>
      ${ui.busy === 'apple' ? meter(ui.progress || 0, 1, { tone: 'accent' }) : ''}
    </section>

    <section class="card">
      <h2>Goals</h2>
      ${goalField('sleepHours', 'Sleep (hours)', '0.25')}
      ${goalField('steps', 'Steps per day', '500')}
      ${goalField('activeCal', 'Active calories', '50')}
      ${goalField('exerciseMin', 'Exercise minutes', '5')}
      ${goalField('workoutsPerWeek', 'Workouts per week', '1')}
      <label class="field inline"><span>Units</span><select data-setting="units"><option value="metric" ${st.units === 'metric' ? 'selected' : ''}>Metric (kg)</option><option value="imperial" ${st.units === 'imperial' ? 'selected' : ''}>Imperial (lb)</option></select></label>
    </section>

    <section class="card">
      <h2>AI coach</h2>
      <p class="small muted">Optional. Your key stays on this device and is only sent to Anthropic when you ask for a check-in.</p>
      <label class="field"><span>Anthropic API key</span><input type="password" data-setting="anthropicKey" value="${esc(st.anthropicKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
    </section>

    <section class="card">
      <h2>Your data</h2>
      <p class="small muted">Everything is stored on this device only. Back it up now and then.</p>
      <div class="btn-row">
        <button class="btn" data-action="export">Export backup</button>
        <label class="btn file-btn">Restore backup<input type="file" accept=".json,application/json" data-action="import-backup" hidden></label>
        <button class="btn" data-action="load-demo">Load sample data</button>
        <button class="btn danger" data-action="reset">Erase everything</button>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- data sources

async function runOuraSync({ quiet = false } = {}) {
  const s = getState();
  const st = s.settings;
  if (!st.ouraToken) return;
  const end = today();
  const start = st.ouraLastSync ? addDays(dayKey(new Date(st.ouraLastSync)), -3) : addDays(end, -120);
  ui.busy = 'oura';
  ui.error = null;
  render();
  try {
    const { days, workouts } = await syncOura({ token: st.ouraToken, proxy: st.ouraProxy, start, end });
    mergeDays('oura', days);
    mergeWorkouts('oura', workouts, start, end);
    update((x) => (x.settings.ouraLastSync = Date.now()));
    if (!quiet) toast(`Oura synced: ${Object.keys(days).length} days`);
  } catch (e) {
    ui.error = e.message;
    if (!quiet) toast(e.message, 6000);
  } finally {
    ui.busy = null;
    render();
  }
}

async function runAppleImport(file) {
  const windowDays = Number(document.getElementById('apple-window')?.value ?? 365);
  const sinceKey = windowDays ? addDays(today(), -windowDays) : '0000-00-00';
  ui.busy = 'apple';
  ui.progress = 0;
  ui.error = null;
  render();
  try {
    let lastPaint = 0;
    const { days, workouts, records } = await importAppleHealth(file, {
      sinceKey,
      onProgress: (p) => {
        ui.progress = p;
        if (Date.now() - lastPaint > 250) {
          lastPaint = Date.now();
          render();
        }
      },
    });
    mergeDays('apple', days);
    mergeWorkouts('apple', workouts, sinceKey, today());
    update((x) => (x.settings.appleLastImport = Date.now()));
    toast(`Imported ${records.toLocaleString()} records across ${Object.keys(days).length} days and ${workouts.length} workouts`, 5000);
  } catch (e) {
    ui.error = `Apple Health import failed: ${e.message}`;
  } finally {
    ui.busy = null;
    render();
  }
}

// ---------------------------------------------------------------- events

const actions = {
  go: (el) => go(el.dataset.to),
  'load-demo': () => {
    if (Object.keys(getState().days).length && !confirm('Replace your data with sample data?')) return;
    const demo = buildDemoData(today());
    update((s) => Object.assign(s, demo, { settings: s.settings }));
    toast('Sample data loaded — have a look around');
    go('today');
  },
  'start-routine': (el) => startSession(getState().routines.find((r) => r.id === el.dataset.id)),
  'start-empty': () => startSession(null),
  'new-routine': () => go(`routine/${uid()}`),
  'toggle-day': (el) => {
    const d = Number(el.dataset.day);
    const days = ui.routineDraft.days;
    ui.routineDraft.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    render();
  },
  'ex-add': () => {
    ui.routineDraft.exercises.push({ name: '', sets: 3, reps: '8', weight: '' });
    render();
  },
  'ex-remove': (el) => {
    ui.routineDraft.exercises.splice(Number(el.dataset.i), 1);
    render();
  },
  'ex-move': (el) => {
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.dir);
    const ex = ui.routineDraft.exercises;
    [ex[i], ex[j]] = [ex[j], ex[i]];
    render();
  },
  'routine-save': () => {
    const d = ui.routineDraft;
    d.name = d.name.trim();
    d.exercises = d.exercises.filter((e) => e.name.trim());
    if (!d.name) return toast('Give the routine a name');
    if (!d.exercises.length) return toast('Add at least one exercise');
    update((s) => {
      const i = s.routines.findIndex((r) => r.id === d.id);
      if (i === -1) s.routines.push(d);
      else s.routines[i] = d;
    });
    ui.routineDraft = null;
    go('train');
  },
  'routine-cancel': () => {
    ui.routineDraft = null;
    go('train');
  },
  'routine-delete': () => {
    if (!confirm('Delete this routine? Logged workouts are kept.')) return;
    const id = ui.routineDraft.id;
    // Archive rather than delete so past weeks still show what was planned.
    update((s) => {
      const r = s.routines.find((x) => x.id === id);
      if (r) r.archived = true;
    });
    ui.routineDraft = null;
    go('train');
  },
  'set-toggle': (el) => {
    update((s) => {
      const set = s.activeSession.exercises[el.dataset.i].sets[el.dataset.j];
      set.done = !set.done;
    });
  },
  'set-add': (el) => {
    update((s) => {
      const sets = s.activeSession.exercises[el.dataset.i].sets;
      const prev = sets[sets.length - 1] || { weight: '', reps: '' };
      sets.push({ weight: prev.weight, reps: prev.reps, done: false });
    });
  },
  'session-add-ex': () => {
    const name = prompt('Exercise name');
    if (!name?.trim()) return;
    update((s) => s.activeSession.exercises.push({ name: name.trim(), sets: [{ weight: '', reps: '', done: false }] }));
  },
  'session-discard': () => {
    if (!confirm('Discard this workout?')) return;
    update((s) => (s.activeSession = null));
    go('train');
  },
  'session-finish': () => {
    const a = getState().activeSession;
    const doneSets = a.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
    if (!doneSets && !confirm('No sets are checked off. Save anyway?')) return;
    update((s) => {
      s.sessions.push({ ...s.activeSession, finishedAt: Date.now() });
      s.activeSession = null;
    });
    toast('Workout saved. That counts. 💪');
    go('today');
  },
  'delete-session': (el) => {
    if (!confirm('Delete this logged workout?')) return;
    update((s) => (s.sessions = s.sessions.filter((x) => x.id !== el.dataset.id)));
  },
  commit: (el) => {
    const { id, ...c } = JSON.parse(el.dataset.c);
    update((s) => (s.commitments[el.dataset.week] ||= []).push(c));
    toast('Committed. You will be graded on it next Monday.');
  },
  uncommit: (el) => update((s) => s.commitments[el.dataset.week].splice(Number(el.dataset.idx), 1)),
  coach: async (el) => {
    const wk = el.dataset.week;
    ui.coachLoading = true;
    render();
    try {
      const { coachReview } = await import('./coach.js');
      const review = buildWeeklyReview(getState(), wk, today());
      const text = await coachReview(review, getState());
      update((s) => (s.coachNotes[wk] = { text, createdAt: Date.now() }));
    } catch (e) {
      toast(e.message, 6000);
    } finally {
      ui.coachLoading = false;
      render();
    }
  },
  'oura-connect': () => startOuraLogin(getState().settings.ouraClientId.trim()),
  'oura-sync': () => runOuraSync(),
  'oura-disconnect': () => update((s) => Object.assign(s.settings, { ouraToken: '', ouraTokenExpires: 0 })),
  export: () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pulse-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
  reset: () => {
    if (confirm('Erase all data on this device? This cannot be undone.')) resetAll();
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.draft) ui.routineDraft[el.dataset.draft] = el.value;
  else if (el.dataset.ex) {
    const ex = ui.routineDraft.exercises[el.dataset.ex];
    ex[el.dataset.field] = el.dataset.field === 'sets' ? Number(el.value) || 1 : el.value;
  }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.set) {
    const [i, j] = el.dataset.set.split(':');
    // Silent: re-rendering here would swallow the tap that blurred this field.
    update((s) => (s.activeSession.exercises[i].sets[j][el.dataset.field] = el.value), { silent: true });
  } else if (el.hasAttribute('data-session-notes')) {
    update((s) => (s.activeSession.notes = el.value), { silent: true });
  } else if (el.dataset.goal) {
    const v = Number(el.value);
    if (v >= 0) update((s) => (s.goals[el.dataset.goal] = v), { silent: true });
  } else if (el.dataset.setting === 'ouraTokenManual') {
    if (el.value.trim()) {
      update((s) => Object.assign(s.settings, { ouraToken: el.value.trim(), ouraTokenExpires: Date.now() + 30 * 86400000 }));
      runOuraSync();
    }
  } else if (el.dataset.setting) {
    update((s) => (s.settings[el.dataset.setting] = el.value.trim()), { silent: el.tagName === 'INPUT' });
    if (el.dataset.setting === 'ouraClientId') document.querySelector('[data-action="oura-connect"]').disabled = !el.value.trim();
  } else if (el.dataset.action === 'apple-file' && el.files[0]) {
    runAppleImport(el.files[0]);
  } else if (el.dataset.action === 'import-backup' && el.files[0]) {
    el.files[0]
      .text()
      .then((t) => {
        importBackup(t);
        toast('Backup restored');
      })
      .catch((err) => toast(err.message));
  }
});

// Re-render on state changes, but not while the user is typing in a field.
subscribe(() => {
  const focused = document.activeElement;
  if (focused && app.contains(focused) && /INPUT|TEXTAREA|SELECT/.test(focused.tagName) && focused.type !== 'file') return;
  render();
});
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});

// ---------------------------------------------------------------- boot

const redirect = consumeOuraRedirect();
if (redirect?.token) {
  update((s) => Object.assign(s.settings, { ouraToken: redirect.token, ouraTokenExpires: redirect.expiresAt }));
  go('settings');
  runOuraSync();
} else if (redirect?.error) {
  ui.error = redirect.error;
  go('settings');
}

render();

const st = getState().settings;
if (!redirect && st.ouraToken && st.ouraTokenExpires > Date.now() && Date.now() - st.ouraLastSync > 3 * 3600000) {
  runOuraSync({ quiet: true });
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js');
}
