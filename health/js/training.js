// Routines, logged sessions and imported workouts: what was planned vs. what got done.
import { weekDays, weekdayIndex, addDays } from './dates.js';

/** Workouts imported from Oura/Apple that started within this window of a logged session are the same workout. */
const SAME_WORKOUT_WINDOW_MS = 90 * 60 * 1000;

export function sessionsInRange(state, startKey, endKey) {
  return (state.sessions || []).filter((s) => s.date >= startKey && s.date <= endKey);
}

/**
 * Every workout in the range: logged sessions plus imported workouts that don't
 * duplicate a logged session (or each other, when Oura and Apple both record one).
 */
export function allWorkouts(state, startKey, endKey) {
  const logged = sessionsInRange(state, startKey, endKey).map((s) => ({
    id: s.id,
    date: s.date,
    start: s.startedAt,
    name: s.name,
    minutes: s.finishedAt && s.startedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : undefined,
    source: 'app',
    routineId: s.routineId,
  }));
  const result = [...logged];
  const external = (state.externalWorkouts || [])
    .filter((w) => w.date >= startKey && w.date <= endKey)
    .sort((a, b) => (a.source === 'apple' ? -1 : 1) - (b.source === 'apple' ? -1 : 1));
  for (const w of external) {
    const dup = result.some(
      (r) => r.date === w.date && r.start && w.start && Math.abs(r.start - w.start) < SAME_WORKOUT_WINDOW_MS,
    );
    if (!dup) result.push(w);
  }
  return result.sort((a, b) => (a.start || 0) - (b.start || 0));
}

/**
 * Planned routine slots for a week and whether each one happened.
 * A slot is 'done' if the routine was logged that day, 'moved' if it was logged
 * on another day that week, otherwise 'missed' (or 'upcoming' if still ahead).
 */
export function weekPlan(state, startKey, todayKey) {
  const days = weekDays(startKey);
  const endKey = days[6];
  const sessions = sessionsInRange(state, startKey, endKey).filter((s) => s.routineId);
  const used = new Set();
  const slots = [];
  for (const date of days) {
    for (const r of state.routines || []) {
      if (r.archived || !(r.days || []).includes(weekdayIndex(date))) continue;
      slots.push({ date, routineId: r.id, routineName: r.name, status: null, sessionId: null });
    }
  }
  // Same-day matches first so a moved session never steals an on-time slot.
  for (const slot of slots) {
    const s = sessions.find((x) => !used.has(x.id) && x.routineId === slot.routineId && x.date === slot.date);
    if (s) {
      used.add(s.id);
      slot.status = 'done';
      slot.sessionId = s.id;
    }
  }
  for (const slot of slots) {
    if (slot.status) continue;
    const s = sessions.find((x) => !used.has(x.id) && x.routineId === slot.routineId);
    if (s) {
      used.add(s.id);
      slot.status = 'moved';
      slot.sessionId = s.id;
      slot.doneOn = s.date;
    } else {
      slot.status = todayKey && slot.date >= todayKey ? 'upcoming' : 'missed';
    }
  }
  return slots;
}

export function routinesForDay(state, key) {
  return (state.routines || []).filter((r) => !r.archived && (r.days || []).includes(weekdayIndex(key)));
}

/** Most recent logged sets for an exercise name, for "last time" hints. */
export function lastPerformance(state, exerciseName, beforeKey = addDays('9999-12-30', 0)) {
  const name = exerciseName.trim().toLowerCase();
  const sessions = (state.sessions || []).filter((s) => s.date <= beforeKey).sort((a, b) => b.startedAt - a.startedAt);
  for (const s of sessions) {
    const ex = s.exercises.find((e) => e.name.trim().toLowerCase() === name);
    const done = ex?.sets.filter((set) => set.done);
    if (done?.length) return { date: s.date, sets: done };
  }
  return null;
}

export function sessionVolume(session) {
  let volume = 0;
  let sets = 0;
  for (const ex of session.exercises) {
    for (const set of ex.sets) {
      if (!set.done) continue;
      sets += 1;
      volume += (Number(set.reps) || 0) * (Number(set.weight) || 0);
    }
  }
  return { volume, sets };
}
