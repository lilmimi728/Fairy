// Sample data so the app can be explored before connecting real sources.
import { addDays, weekStart, weekdayIndex, parseKey, range } from './dates.js';
import { emptyState } from './store.js';

function rng(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoData(todayKey) {
  const rand = rng(42);
  const jitter = (base, spread) => base + (rand() - 0.5) * 2 * spread;
  const s = emptyState();

  s.routines = [
    {
      id: 'upper',
      name: 'Upper A',
      days: [0, 3],
      exercises: [
        { name: 'Bench press', sets: 4, reps: '6', weight: '70' },
        { name: 'Pull-ups', sets: 4, reps: '8', weight: '' },
        { name: 'Overhead press', sets: 3, reps: '8', weight: '40' },
        { name: 'Cable row', sets: 3, reps: '10', weight: '55' },
      ],
    },
    {
      id: 'lower',
      name: 'Lower A',
      days: [1, 4],
      exercises: [
        { name: 'Back squat', sets: 4, reps: '5', weight: '90' },
        { name: 'Romanian deadlift', sets: 3, reps: '8', weight: '80' },
        { name: 'Walking lunge', sets: 3, reps: '12', weight: '16' },
      ],
    },
    { id: 'z2', name: 'Zone 2 run', days: [5], exercises: [{ name: 'Easy run (min)', sets: 1, reps: '40', weight: '' }] },
  ];

  const start = addDays(weekStart(todayKey), -28);
  const lastWeek = addDays(weekStart(todayKey), -7);
  for (const key of range(start, 28 + weekdayIndex(todayKey) + 1)) {
    const inLastWeek = key >= lastWeek && key < addDays(lastWeek, 7);
    const weekend = weekdayIndex(key) >= 5;
    // Last week slips: shorter, later nights mid-week and lower readiness.
    const sleep = Math.max(5.2, jitter(inLastWeek && weekdayIndex(key) % 2 ? 6.4 : 7.4, 0.6));
    const readiness = Math.round(Math.min(95, Math.max(55, 60 + (sleep - 5.5) * 10 + jitter(0, 4))));
    const bedtime = Math.round(jitter(inLastWeek ? -20 : -60, inLastWeek ? 70 : 20));
    s.days[key] = {
      oura: {
        sleepHours: Math.round(sleep * 100) / 100,
        sleepScore: Math.round(Math.min(95, 55 + sleep * 4 + jitter(0, 3))),
        readiness,
        hrv: Math.round(jitter(inLastWeek ? 44 : 52, 6)),
        rhr: Math.round(jitter(inLastWeek ? 56 : 53, 2)),
        bedtime,
        steps: Math.round(jitter(weekend ? 5200 : 9200, 1800)),
        activeCal: Math.round(jitter(480, 120)),
      },
      apple: {
        steps: Math.round(jitter(weekend ? 5600 : 9800, 2000)),
        activeCal: Math.round(jitter(weekend ? 380 : 560, 110)),
        exerciseMin: Math.round(jitter(weekend ? 18 : 38, 12)),
        weight: Math.round(jitter(78.4, 0.4) * 10) / 10,
      },
    };
    if (key === todayKey) delete s.days[key].oura.steps; // today's day isn't over
  }

  // Logged workouts: mostly on plan, except last week misses Thursday and Saturday.
  for (const key of range(start, 28 + weekdayIndex(todayKey))) {
    const inLastWeek = key >= lastWeek && key < addDays(lastWeek, 7);
    for (const r of s.routines) {
      if (!r.days.includes(weekdayIndex(key))) continue;
      if (inLastWeek && [3, 5].includes(weekdayIndex(key))) continue;
      if (!inLastWeek && rand() < 0.1) continue;
      const startedAt = parseKey(key).getTime() - 5 * 3600000 + Math.round(rand() * 3) * 3600000; // morning
      s.sessions.push({
        id: `demo-${key}-${r.id}`,
        routineId: r.id,
        name: r.name,
        date: key,
        startedAt,
        finishedAt: startedAt + (45 + Math.round(rand() * 20)) * 60000,
        notes: '',
        exercises: r.exercises.map((e) => ({
          name: e.name,
          sets: Array.from({ length: e.sets }, () => ({ weight: e.weight, reps: e.reps, done: true })),
        })),
      });
    }
  }
  // One extra activity recorded only by the watch.
  const walkDay = addDays(lastWeek, 6);
  s.externalWorkouts.push({ id: 'apple:demo-walk', date: walkDay, start: parseKey(walkDay).getTime(), name: 'Hiking', minutes: 95, calories: 520, source: 'apple' });

  // A commitment made for last week, so the review has something to grade.
  s.commitments[lastWeek] = [
    { kind: 'metricDays', metric: 'sleepHours', threshold: 7.5, days: 5 },
    { kind: 'workouts', count: 4 },
  ];
  return s;
}
