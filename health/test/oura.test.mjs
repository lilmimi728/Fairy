import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOura, bedtimeMinutes } from '../js/oura.js';

test('normalizes Oura collections into daily metrics', () => {
  const { days, workouts } = normalizeOura({
    dailySleep: [{ day: '2026-09-28', score: 81 }],
    readiness: [{ day: '2026-09-28', score: 77 }],
    activity: [{ day: '2026-09-28', steps: 9100, active_calories: 520, score: 88 }],
    sleep: [
      { day: '2026-09-28', type: 'long_sleep', total_sleep_duration: 7 * 3600 + 1800, average_hrv: 48, lowest_heart_rate: 51, bedtime_start: '2026-09-27T23:15:00-07:00' },
      { day: '2026-09-28', type: 'late_nap', total_sleep_duration: 1800, average_hrv: 30 },
    ],
    workouts: [{ id: 'w1', day: '2026-09-28', activity: 'strength_training', start_datetime: '2026-09-28T07:30:00-07:00', end_datetime: '2026-09-28T08:15:00-07:00', calories: 280.6 }],
  });
  assert.deepEqual(days['2026-09-28'], {
    sleepScore: 81, readiness: 77, steps: 9100, activeCal: 520, activityScore: 88,
    sleepHours: 7.5, hrv: 48, rhr: 51, bedtime: -45,
  });
  assert.deepEqual(workouts[0], { id: 'oura:w1', date: '2026-09-28', start: Date.parse('2026-09-28T07:30:00-07:00'), name: 'Strength training', minutes: 45, calories: 281, source: 'oura' });
});

test('bedtime minutes: evening negative, after midnight positive', () => {
  assert.equal(bedtimeMinutes('2026-09-27T22:30:00+00:00'), -90);
  assert.equal(bedtimeMinutes('2026-09-28T00:40:00+00:00'), 40);
});
