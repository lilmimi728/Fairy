// Weekly accountability: turns last week's numbers into plain statements, grades
// commitments made the week before, and proposes measurable commitments for next week.
import { addDays, weekDays, weekdayIndex, formatDay, WEEKDAY_SHORT } from './dates.js';
import { METRIC_BY_ID, resolveRange, mean, stdev, formatMetric, formatClock } from './metrics.js';
import { allWorkouts, weekPlan } from './training.js';

const GOAL_METRICS = ['sleepHours', 'steps', 'activeCal', 'exerciseMin'];
const MIN_DAYS_FOR_GOAL = 3;

const fmt = (id, v, units) => formatMetric(id, v, { units });
const pct = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : 0);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// ---------- commitments ----------

/** Human description of a measurable commitment. */
export function describeCommitment(c, units) {
  const m = METRIC_BY_ID[c.metric];
  switch (c.kind) {
    case 'metricDays':
      return `${m.label} ${fmt(c.metric, c.threshold, units)}+ on at least ${plural(c.days, 'day')}`;
    case 'metricAvg':
      return `Average ${fmt(c.metric, c.threshold, units)}+ ${m.label.toLowerCase()}`;
    case 'workouts':
      return `Complete ${plural(c.count, 'workout')}`;
    case 'followPlan':
      return 'Complete every planned routine';
    case 'bedtimeWindow':
      return `In bed by ${formatClock(c.threshold)} on at least ${plural(c.days, 'night')}`;
    default:
      return c.text || 'Commitment';
  }
}

/** Grade a commitment against a week's data. Returns { kept, actual, target, detail }. */
export function gradeCommitment(c, week, units) {
  switch (c.kind) {
    case 'metricDays': {
      const met = week.rows.filter((r) => r[c.metric] != null && r[c.metric] >= c.threshold).length;
      return { kept: met >= c.days, actual: met, target: c.days, detail: `${met} of ${c.days} days` };
    }
    case 'metricAvg': {
      const avg = mean(week.rows.map((r) => r[c.metric]));
      if (avg == null) return { kept: false, actual: null, target: c.threshold, detail: 'no data recorded' };
      return {
        kept: avg >= c.threshold,
        actual: avg,
        target: c.threshold,
        detail: `averaged ${fmt(c.metric, avg, units)}`,
      };
    }
    case 'workouts': {
      const n = week.workouts.length;
      return { kept: n >= c.count, actual: n, target: c.count, detail: `${n} of ${c.count} done` };
    }
    case 'followPlan': {
      const due = week.plan.filter((s) => s.status !== 'upcoming');
      const done = due.filter((s) => s.status === 'done' || s.status === 'moved').length;
      return {
        kept: due.length > 0 && done === due.length,
        actual: done,
        target: due.length,
        detail: `${done} of ${due.length} planned sessions`,
      };
    }
    case 'bedtimeWindow': {
      const met = week.rows.filter((r) => r.bedtime != null && r.bedtime <= c.threshold).length;
      return { kept: met >= c.days, actual: met, target: c.days, detail: `${met} of ${c.days} nights` };
    }
    default:
      return { kept: false, actual: null, target: null, detail: '' };
  }
}

// ---------- week data ----------

export function weekData(state, startKey, todayKey) {
  const keys = weekDays(startKey);
  const endKey = keys[6];
  return {
    startKey,
    endKey,
    keys,
    rows: resolveRange(state.days || {}, keys),
    workouts: allWorkouts(state, startKey, endKey),
    plan: weekPlan(state, startKey, todayKey),
  };
}

function metricSummary(id, week, prev, goals) {
  const values = week.rows.map((r) => r[id]);
  const withData = values.filter((v) => v != null);
  const avg = mean(values);
  const prevAvg = mean(prev.rows.map((r) => r[id]));
  const goal = METRIC_BY_ID[id].goal ? goals[METRIC_BY_ID[id].goal] : undefined;
  const daysMet = goal != null ? withData.filter((v) => v >= goal).length : undefined;
  return {
    id,
    label: METRIC_BY_ID[id].label,
    avg,
    prevAvg,
    deltaPct: avg != null && prevAvg != null ? pct(avg, prevAvg) : undefined,
    goal,
    daysMet,
    daysWithData: withData.length,
  };
}

// ---------- the review ----------

/**
 * Build the accountability review for the week starting `startKey`.
 * Insight tones: 'good' | 'warning' | 'critical' | 'neutral'.
 */
export function buildWeeklyReview(state, startKey, todayKey) {
  const goals = state.goals || {};
  const units = state.settings?.units || 'metric';
  const week = weekData(state, startKey, todayKey);
  const prev = weekData(state, addDays(startKey, -7), todayKey);

  const metrics = ['sleepHours', 'readiness', 'hrv', 'rhr', 'steps', 'activeCal', 'exerciseMin', 'bedtime', 'weight']
    .map((id) => metricSummary(id, week, prev, goals))
    .filter((m) => m.daysWithData > 0);
  const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));

  const insights = [];
  const targets = []; // { label, met } — feeds the overall score
  const add = (tone, kind, text, extra = {}) => insights.push({ tone, kind, text, ...extra });

  // 1. Commitments made for this week come first: they are the promises.
  const commitments = (state.commitments?.[startKey] || []).map((c) => {
    const result = gradeCommitment(c, week, units);
    const label = describeCommitment(c, units);
    targets.push({ label, met: result.kept });
    add(
      result.kept ? 'good' : 'critical',
      'commitment',
      result.kept
        ? `Kept your word: “${label}” — ${result.detail}.`
        : `Commitment broken: “${label}” — ${result.detail}.`,
    );
    return { ...c, label, result };
  });

  // 2. Training: the plan vs. what actually happened.
  const due = week.plan.filter((s) => s.status !== 'upcoming');
  const done = due.filter((s) => s.status === 'done');
  const moved = due.filter((s) => s.status === 'moved');
  const missed = due.filter((s) => s.status === 'missed');
  const workoutGoal = goals.workoutsPerWeek;
  const workoutCount = week.workouts.length;
  if (due.length) {
    const completed = done.length + moved.length;
    if (!missed.length) {
      add(
        'good',
        'training',
        `You completed every planned session (${completed}/${due.length})${moved.length ? `, ${plural(moved.length, 'one', 'some')} on a different day` : ''}.`,
      );
    } else {
      const list = missed.map((s) => `${WEEKDAY_SHORT[weekdayIndex(s.date)]} ${s.routineName}`).join(', ');
      add(
        missed.length / due.length >= 0.5 ? 'critical' : 'warning',
        'training',
        `You planned ${plural(due.length, 'session')} and completed ${completed}. Skipped: ${list}.`,
      );
    }
  }
  // A week with no data, no plan and no workouts wasn't tracked; don't grade it as failed.
  const trackedDays = week.rows.filter((r) => r.sleepHours != null || r.steps != null).length;
  if (workoutGoal && (due.length || workoutCount || trackedDays)) {
    const met = workoutCount >= workoutGoal;
    targets.push({ label: `${workoutGoal} workouts`, met });
    // Skip when the plan statement above already tells the same story.
    const planToldIt = due.length > 0 && met === (missed.length === 0);
    if (!planToldIt) {
      add(
        met ? 'good' : workoutCount / workoutGoal < 0.5 ? 'critical' : 'warning',
        'training',
        met
          ? `${plural(workoutCount, 'workout')} logged — goal of ${workoutGoal} reached.`
          : `${plural(workoutCount, 'workout')} logged against a goal of ${workoutGoal}. That's ${workoutGoal - workoutCount} short.`,
      );
    }
  }

  // 3. Daily goals: how many days actually cleared the bar.
  for (const id of GOAL_METRICS) {
    const m = byId[id];
    if (!m || m.goal == null || m.daysWithData < MIN_DAYS_FOR_GOAL) continue;
    const ratio = m.daysMet / m.daysWithData;
    const goalText = fmt(id, m.goal, units);
    const trend = trendClause(m, units);
    targets.push({ label: `${m.label} goal`, met: ratio >= 0.7 });
    if (ratio >= 0.85) {
      add('good', 'goal', `${m.label}: goal of ${goalText} hit on ${m.daysMet} of ${m.daysWithData} days${trend}.`);
    } else if (ratio >= 0.5) {
      add('warning', 'goal', `${m.label} was hit-or-miss: ${m.daysMet} of ${m.daysWithData} days at ${goalText}+${trend}.`);
    } else {
      const gap = m.goal - m.avg;
      add(
        'critical',
        'goal',
        `${m.label} fell short: only ${m.daysMet} of ${m.daysWithData} days reached ${goalText}. You averaged ${fmt(id, m.avg, units)} — ${fmt(id, gap, units)} below target${trend}.`,
      );
    }
  }

  // 4. Recovery signals without explicit goals: call out real moves only.
  const hrv = byId.hrv;
  if (hrv?.deltaPct != null && hrv.daysWithData >= 3 && Math.abs(hrv.deltaPct) >= 8) {
    add(
      hrv.deltaPct > 0 ? 'good' : 'warning',
      'recovery',
      hrv.deltaPct > 0
        ? `HRV rose ${Math.round(hrv.deltaPct)}% (${fmt('hrv', hrv.prevAvg)} → ${fmt('hrv', hrv.avg)}). Your body is absorbing the work.`
        : `HRV dropped ${Math.round(-hrv.deltaPct)}% (${fmt('hrv', hrv.prevAvg)} → ${fmt('hrv', hrv.avg)}). Recovery is lagging — look at sleep, alcohol and training load.`,
    );
  }
  const rhr = byId.rhr;
  if (rhr?.avg != null && rhr.prevAvg != null && rhr.daysWithData >= 3 && Math.abs(rhr.avg - rhr.prevAvg) >= 2.5) {
    const up = rhr.avg > rhr.prevAvg;
    add(
      up ? 'warning' : 'good',
      'recovery',
      `Resting heart rate ${up ? 'climbed' : 'fell'} to ${fmt('rhr', rhr.avg)} (from ${fmt('rhr', rhr.prevAvg)}).${up ? ' Elevated RHR often means stress, illness or under-recovery.' : ''}`,
    );
  }
  const readiness = byId.readiness;
  if (readiness?.avg != null && readiness.daysWithData >= 3 && readiness.avg < 70) {
    add('warning', 'recovery', `Readiness averaged ${Math.round(readiness.avg)} — below 70 all week means you were running on fumes.`);
  }

  // 5. Patterns: link behaviour to outcomes so the "why" is visible.
  const sleepPattern = shortSleepPattern(state, week, goals);
  if (sleepPattern) add('neutral', 'pattern', sleepPattern);
  const weekendPattern = weekendStepsPattern(week);
  if (weekendPattern) add('neutral', 'pattern', weekendPattern);
  const bedSd = stdev(week.rows.map((r) => r.bedtime));
  if (bedSd != null && bedSd >= 45 && byId.bedtime?.daysWithData >= 4) {
    add(
      'warning',
      'pattern',
      `Your bedtime swung by about ±${Math.round(bedSd)} minutes (average ${formatClock(byId.bedtime.avg)}). A consistent bedtime is one of the cheapest sleep wins.`,
    );
  }

  // 6. Gaps in tracking are an accountability problem too.
  if (trackedDays < 7) {
    add(
      'neutral',
      'data',
      trackedDays === 0
        ? 'No health data for this week yet. Sync Oura or import Apple Health so the review has something to judge.'
        : `${plural(7 - trackedDays, 'day')} had no data. Sync or import so nothing slips through unnoticed.`,
    );
  }

  const met = targets.filter((t) => t.met).length;
  const score = { met, total: targets.length, pct: targets.length ? Math.round((met / targets.length) * 100) : null };

  return {
    startKey,
    endKey: week.endKey,
    verdict: verdictFor(score),
    score,
    targets,
    commitments,
    insights: sortInsights(insights),
    metrics,
    plan: week.plan,
    workouts: week.workouts,
    suggestions: suggestCommitments(state, { byId, missed, due, workoutCount, workoutGoal, bedSd, bedAvg: byId.bedtime?.avg }),
  };
}

function trendClause(m, units) {
  if (m.deltaPct == null || Math.abs(m.deltaPct) < 5) return '';
  const dir = m.deltaPct > 0 ? 'up' : 'down';
  return `, ${dir} ${Math.abs(Math.round(m.deltaPct))}% on the week before (${fmt(m.id, m.prevAvg, units)})`;
}

function verdictFor(score) {
  if (score.pct == null) return { tone: 'neutral', title: 'Not enough data', line: 'Set goals and connect a data source to get a real review.' };
  if (score.pct >= 80) return { tone: 'good', title: 'Strong week', line: `You met ${score.met} of ${score.total} targets. Keep the bar where it is.` };
  if (score.pct >= 50) return { tone: 'warning', title: 'Mixed week', line: `You met ${score.met} of ${score.total} targets. Close the gaps below.` };
  return { tone: 'critical', title: 'Off track', line: `You met ${score.met} of ${score.total} targets. Pick one thing and fix it this week.` };
}

const TONE_ORDER = { critical: 0, warning: 1, good: 2, neutral: 3 };
const KIND_ORDER = { commitment: 0, training: 1, goal: 2, recovery: 3, pattern: 4, data: 5 };
function sortInsights(list) {
  return list.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/** Next-day readiness after short nights vs. full nights (uses the day after the week too). */
function shortSleepPattern(state, week, goals) {
  const target = goals.sleepHours;
  if (!target) return null;
  const nextKeys = week.keys.map((k) => addDays(k, 1));
  const next = resolveRange(state.days || {}, nextKeys);
  const short = [];
  const full = [];
  week.rows.forEach((r, i) => {
    if (r.sleepHours == null || next[i].readiness == null) return;
    (r.sleepHours < target ? short : full).push(next[i].readiness);
  });
  // Oura's readiness for a date already reflects that night's sleep, so compare same-day too.
  const sameShort = [];
  const sameFull = [];
  week.rows.forEach((r) => {
    if (r.sleepHours == null || r.readiness == null) return;
    (r.sleepHours < target ? sameShort : sameFull).push(r.readiness);
  });
  const [s, f] = sameShort.length >= 2 && sameFull.length >= 2 ? [sameShort, sameFull] : [short, full];
  if (s.length < 2 || f.length < 2) return null;
  const ms = mean(s);
  const mf = mean(f);
  if (mf - ms < 5) return null;
  return `On the ${s.length} nights you slept under ${formatMetric('sleepHours', target)}, readiness averaged ${Math.round(ms)} vs ${Math.round(mf)} after full nights. Sleep is driving your recovery.`;
}

function weekendStepsPattern(week) {
  const weekday = week.rows.slice(0, 5).map((r) => r.steps);
  const weekend = week.rows.slice(5).map((r) => r.steps);
  const a = mean(weekday);
  const b = mean(weekend);
  if (a == null || b == null || weekend.filter((v) => v != null).length < 2) return null;
  if (Math.abs(a - b) / Math.max(a, b) < 0.3) return null;
  return b < a
    ? `Weekends are where it slips: weekday steps averaged ${fmt('steps', a)}, weekends ${fmt('steps', b)}.`
    : `You move more on weekends (${fmt('steps', b)}) than weekdays (${fmt('steps', a)}). Look for a weekday walk.`;
}

/** Up to three measurable commitments aimed at the biggest gaps. */
export function suggestCommitments(state, ctx) {
  const goals = state.goals || {};
  const out = [];
  const push = (c, priority) => out.push({ ...c, priority, id: `${c.kind}:${c.metric || ''}` });

  if (ctx.missed?.length) push({ kind: 'followPlan' }, 0);
  if (ctx.workoutGoal && ctx.workoutCount < ctx.workoutGoal) push({ kind: 'workouts', count: ctx.workoutGoal }, 1);

  for (const id of GOAL_METRICS) {
    const m = ctx.byId?.[id];
    if (!m || m.goal == null || m.daysWithData < MIN_DAYS_FOR_GOAL) continue;
    const ratio = m.daysMet / m.daysWithData;
    if (ratio >= 0.85) continue;
    // Ask for a realistic step up: two more days than last week, capped at the full week.
    const days = Math.min(7, Math.max(m.daysMet + 2, 4));
    push({ kind: 'metricDays', metric: id, threshold: m.goal, days }, 2 + ratio);
  }

  if (ctx.bedSd != null && ctx.bedSd >= 45 && ctx.bedAvg != null) {
    const target = Math.round(ctx.bedAvg / 15) * 15; // nearest quarter hour of the current average
    push({ kind: 'bedtimeWindow', threshold: target, days: 5 }, 3);
  }

  if (!out.length && goals.workoutsPerWeek) push({ kind: 'workouts', count: goals.workoutsPerWeek }, 5);
  if (out.length < 2 && goals.sleepHours) push({ kind: 'metricDays', metric: 'sleepHours', threshold: goals.sleepHours, days: 5 }, 6);

  const seen = new Set();
  return out
    .sort((a, b) => a.priority - b.priority)
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .slice(0, 3)
    .map(({ priority, ...c }) => c);
}

/** Live progress on this week's commitments (for the Today screen). */
export function commitmentProgress(state, startKey, todayKey) {
  const units = state.settings?.units || 'metric';
  const week = weekData(state, startKey, todayKey);
  return (state.commitments?.[startKey] || []).map((c) => ({
    ...c,
    label: describeCommitment(c, units),
    result: gradeCommitment(c, week, units),
  }));
}

/** Compact, model-friendly summary of a review for the AI coach. */
export function reviewForCoach(review, state) {
  const units = state.settings?.units || 'metric';
  return {
    week: `${formatDay(review.startKey)} to ${formatDay(review.endKey)}`,
    verdict: review.verdict.title,
    targetsMet: `${review.score.met}/${review.score.total}`,
    goals: state.goals,
    metrics: review.metrics.map((m) => ({
      metric: m.label,
      average: fmt(m.id, m.avg, units),
      previousWeek: m.prevAvg != null ? fmt(m.id, m.prevAvg, units) : null,
      daysAtGoal: m.goal != null ? `${m.daysMet}/${m.daysWithData}` : null,
    })),
    training: {
      workouts: review.workouts.map((w) => `${formatDay(w.date)}: ${w.name}${w.minutes ? ` (${w.minutes} min)` : ''}`),
      plan: review.plan.map((s) => `${formatDay(s.date)} ${s.routineName}: ${s.status}`),
    },
    commitments: review.commitments.map((c) => `${c.label}: ${c.result.kept ? 'kept' : 'broken'} (${c.result.detail})`),
    observations: review.insights.map((i) => i.text),
  };
}
