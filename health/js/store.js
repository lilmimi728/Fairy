// App state, persisted on-device in localStorage. This is the only module that knows
// where data lives, so a cloud backend (e.g. Supabase) can be swapped in here later.
import { DEFAULT_GOALS } from './metrics.js';

const KEY = 'pulse.v1';

export function emptyState() {
  return {
    version: 1,
    days: {}, // dayKey -> { oura: {...}, apple: {...} }
    externalWorkouts: [], // imported from Oura / Apple Health
    routines: [],
    sessions: [], // workouts logged in the app
    activeSession: null,
    goals: { ...DEFAULT_GOALS },
    commitments: {}, // weekStartKey -> [commitment]
    coachNotes: {}, // weekStartKey -> { text, createdAt }
    reviewsSeen: {}, // weekStartKey -> timestamp
    settings: {
      units: 'metric',
      ouraClientId: '',
      ouraToken: '',
      ouraTokenExpires: 0,
      ouraProxy: '',
      ouraLastSync: 0,
      appleLastImport: 0,
      anthropicKey: '',
    },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const saved = JSON.parse(raw);
    const base = emptyState();
    return { ...base, ...saved, goals: { ...base.goals, ...saved.goals }, settings: { ...base.settings, ...saved.settings } };
  } catch {
    return emptyState();
  }
}

let state = load();
const listeners = new Set();

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate state via a function, then persist and notify. `silent` skips re-rendering (typed field values). */
export function update(fn, { silent = false } = {}) {
  fn(state);
  persist();
  if (!silent) for (const l of listeners) l(state);
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Could not save', e);
    alert('Storage is full. Export a backup from Settings, then clear old data.');
  }
}

/** Merge per-source daily metrics, e.g. mergeDays('oura', { '2026-09-01': { readiness: 80 } }). */
export function mergeDays(source, days) {
  update((s) => {
    for (const [k, metrics] of Object.entries(days)) {
      const d = (s.days[k] ||= {});
      d[source] = { ...d[source], ...metrics };
    }
  });
}

/** Replace imported workouts from one source within a date range. */
export function mergeWorkouts(source, workouts, startKey, endKey) {
  update((s) => {
    s.externalWorkouts = s.externalWorkouts.filter(
      (w) => w.source !== source || w.date < startKey || w.date > endKey,
    );
    s.externalWorkouts.push(...workouts);
    s.externalWorkouts.sort((a, b) => a.start - b.start);
  });
}

export function exportBackup() {
  return JSON.stringify({ ...state, settings: { ...state.settings, ouraToken: '', anthropicKey: '' } }, null, 2);
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (!data || data.version !== 1) throw new Error('Not a Pulse backup file');
  update((s) => {
    const keep = { ...s.settings };
    Object.assign(s, emptyState(), data);
    s.settings = { ...emptyState().settings, ...data.settings, ouraToken: keep.ouraToken, ouraTokenExpires: keep.ouraTokenExpires, anthropicKey: keep.anthropicKey };
  });
}

export function resetAll() {
  update((s) => Object.assign(s, emptyState()));
}

export const uid = () => crypto.randomUUID().slice(0, 8) + Date.now().toString(36);
