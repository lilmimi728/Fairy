import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReview, gradeCommitment, weekData, describeCommitment, commitmentProgress } from '../js/review.js';
import { weekPlan, allWorkouts } from '../js/training.js';
import { lastCompleteWeekStart, weekStart, range, addDays } from '../js/dates.js';
import { emptyState } from '../js/store.js';
import { buildDemoData } from '../js/demo.js';

const TODAY = '2026-10-01'; // Thursday
const WEEK = '2026-09-21'; // last complete week (Mon)

function baseState() {
  const s = emptyState();
  s.routines = [
    { id: 'u', name: 'Upper', days: [0, 3], exercises: [{ name: 'Bench', sets: 3, reps: '5' }] },
    { id: 'l', name: 'Lower', days: [1], exercises: [{ name: 'Squat', sets: 3, reps: '5' }] },
  ];
  return s;
}
const session = (id, routineId, date, hour = 7) => ({
  id, routineId, name: routineId, date, startedAt: Date.parse(`${date}T0${hour}:00:00`), finishedAt: Date.parse(`${date}T0${hour + 1}:00:00`), exercises: [],
});

test('date helpers', () => {
  assert.equal(weekStart(TODAY), '2026-09-28');
  assert.equal(lastCompleteWeekStart(TODAY), WEEK);
  assert.equal(lastCompleteWeekStart('2026-09-28'), WEEK, 'on Monday the week just ended is reviewed');
});

test('plan: on-time, moved and missed sessions', () => {
  const s = baseState();
  s.sessions = [session('a', 'u', '2026-09-21'), session('b', 'l', '2026-09-23')];
  const plan = weekPlan(s, WEEK, TODAY);
  const status = Object.fromEntries(plan.map((p) => [`${p.date}:${p.routineId}`, p.status]));
  assert.deepEqual(status, { '2026-09-21:u': 'done', '2026-09-22:l': 'moved', '2026-09-24:u': 'missed' });
  assert.equal(weekPlan(s, '2026-09-28', TODAY).find((p) => p.date === '2026-10-01').status, 'upcoming');
});

test('imported workouts that duplicate a logged session are counted once', () => {
  const s = baseState();
  s.sessions = [session('a', 'u', '2026-09-21')];
  s.externalWorkouts = [
    { id: 'apple:1', date: '2026-09-21', start: Date.parse('2026-09-21T07:05:00'), name: 'Strength', source: 'apple' },
    { id: 'oura:1', date: '2026-09-21', start: Date.parse('2026-09-21T07:06:00'), name: 'Strength', source: 'oura' },
    { id: 'apple:2', date: '2026-09-21', start: Date.parse('2026-09-21T18:00:00'), name: 'Walk', source: 'apple' },
  ];
  assert.deepEqual(allWorkouts(s, WEEK, '2026-09-27').map((w) => w.id), ['a', 'apple:2']);
});

test('review holds you to the plan, goals and commitments', () => {
  const s = baseState();
  s.goals = { sleepHours: 7.5, steps: 8000, activeCal: 500, exerciseMin: 30, workoutsPerWeek: 3 };
  s.sessions = [session('a', 'u', '2026-09-21')];
  const sleep = [6.2, 6.0, 7.8, 6.1, 6.4, 8.0, 7.9];
  const ready = [62, 60, 82, 61, 64, 85, 84];
  range(WEEK, 7).forEach((k, i) => {
    s.days[k] = { oura: { sleepHours: sleep[i], readiness: ready[i], hrv: 40, rhr: 58 }, apple: { steps: i < 5 ? 10000 : 3000 } };
    s.days[addDays(k, -7)] = { oura: { sleepHours: 7.6, readiness: 80, hrv: 50, rhr: 54 }, apple: { steps: 9000 } };
  });
  s.commitments[WEEK] = [{ kind: 'metricDays', metric: 'sleepHours', threshold: 7.5, days: 5 }, { kind: 'workouts', count: 1 }];

  const r = buildWeeklyReview(s, WEEK, TODAY);
  const texts = r.insights.map((i) => `${i.tone}|${i.kind}|${i.text}`);
  const has = (re) => assert.ok(texts.some((t) => re.test(t)), `expected ${re}\n${texts.join('\n')}`);

  has(/^critical\|commitment\|Commitment broken: “Sleep 7h 30m\+ on at least 5 days” — 3 of 5 days/);
  has(/^good\|commitment\|Kept your word: “Complete 1 workout”/);
  has(/^critical\|training\|You planned 3 sessions and completed 1\. Skipped: Tue Lower, Thu Upper\./);
  has(/^critical\|goal\|Sleep fell short: only 3 of 7 days/);
  has(/^warning\|recovery\|HRV dropped 20%/);
  has(/^warning\|recovery\|Resting heart rate climbed to 58 bpm/);
  has(/^neutral\|pattern\|On the 4 nights you slept under 7h 30m, readiness averaged 62 vs 84/);
  has(/^neutral\|pattern\|Weekends are where it slips/);
  assert.equal(r.insights[0].kind, 'commitment', 'commitments lead the review');
  assert.equal(r.verdict.title, 'Off track');

  const kinds = r.suggestions.map((c) => c.kind);
  assert.equal(kinds[0], 'followPlan');
  assert.ok(r.suggestions.length <= 3);
  const sleepC = r.suggestions.find((c) => c.metric === 'sleepHours');
  assert.equal(sleepC.days, 5, 'asks for two more days than achieved');
});

test('commitment grading and descriptions', () => {
  const s = baseState();
  s.days['2026-09-22'] = { oura: { bedtime: -70 } };
  s.days['2026-09-23'] = { oura: { bedtime: 30 } };
  const week = weekData(s, WEEK, TODAY);
  const c = { kind: 'bedtimeWindow', threshold: -60, days: 1 };
  assert.equal(describeCommitment(c), 'In bed by 11:00 pm on at least 1 night');
  assert.deepEqual(gradeCommitment(c, week).kept, true);
  assert.equal(gradeCommitment({ kind: 'metricAvg', metric: 'steps', threshold: 8000 }, week).detail, 'no data recorded');
  assert.equal(gradeCommitment({ kind: 'followPlan' }, week).kept, false);
});

test('empty state produces a sensible review', () => {
  const r = buildWeeklyReview(emptyState(), WEEK, TODAY);
  assert.equal(r.verdict.title, 'Not enough data');
  assert.ok(r.insights.some((i) => i.kind === 'data'));
});

test('demo data review grades its commitments and flags missed sessions', () => {
  const s = buildDemoData(TODAY);
  const r = buildWeeklyReview(s, WEEK, TODAY);
  assert.equal(r.commitments.length, 2);
  assert.ok(r.insights.some((i) => /Skipped: Thu Upper A, Sat Zone 2 run/.test(i.text)), r.insights.map((i) => i.text).join('\n'));
  assert.ok(commitmentProgress(s, weekStart(TODAY), TODAY).length === 0);
});
