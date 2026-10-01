// Merges per-source daily data (Oura, Apple Health) into one resolved value per metric.

const first = (...vals) => vals.find((v) => v != null && !Number.isNaN(v));
const maxOf = (...vals) => {
  const nums = vals.filter((v) => v != null && !Number.isNaN(v));
  return nums.length ? Math.max(...nums) : undefined;
};

/**
 * Metric catalogue. `goal` names the goal key in state.goals (minimum targets);
 * `better` is the direction that counts as improvement.
 */
export const METRICS = [
  { id: 'sleepHours', label: 'Sleep', unit: 'h', better: 'up', goal: 'sleepHours', decimals: 1 },
  { id: 'readiness', label: 'Readiness', unit: '', better: 'up', decimals: 0 },
  { id: 'sleepScore', label: 'Sleep score', unit: '', better: 'up', decimals: 0 },
  { id: 'hrv', label: 'HRV', unit: 'ms', better: 'up', decimals: 0 },
  { id: 'rhr', label: 'Resting HR', unit: 'bpm', better: 'down', decimals: 0 },
  { id: 'steps', label: 'Steps', unit: '', better: 'up', goal: 'steps', decimals: 0 },
  { id: 'activeCal', label: 'Active calories', unit: 'kcal', better: 'up', goal: 'activeCal', decimals: 0 },
  { id: 'exerciseMin', label: 'Exercise', unit: 'min', better: 'up', goal: 'exerciseMin', decimals: 0 },
  { id: 'bedtime', label: 'Bedtime', unit: '', better: 'none', decimals: 0 },
  { id: 'weight', label: 'Weight', unit: 'kg', better: 'none', decimals: 1 },
];

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]));

export const DEFAULT_GOALS = {
  sleepHours: 7.5,
  steps: 8000,
  activeCal: 500,
  exerciseMin: 30,
  workoutsPerWeek: 4,
};

/**
 * Resolve one day's merged metrics. Oura wins for sleep and recovery (it is worn overnight);
 * Apple Health wins for movement (phone + watch see more of the day).
 */
export function resolveDay(day = {}) {
  const o = day.oura || {};
  const a = day.apple || {};
  return {
    sleepHours: first(o.sleepHours, a.sleepHours),
    sleepScore: o.sleepScore,
    readiness: o.readiness,
    hrv: first(o.hrv, a.hrv),
    rhr: first(o.rhr, a.rhr),
    steps: maxOf(a.steps, o.steps),
    activeCal: first(a.activeCal, o.activeCal),
    exerciseMin: a.exerciseMin,
    bedtime: o.bedtime, // minutes after midnight, may be negative (before midnight)
    weight: a.weight,
  };
}

export function resolveRange(days, keys) {
  return keys.map((k) => ({ key: k, ...resolveDay(days[k]) }));
}

export function mean(values) {
  const nums = values.filter((v) => v != null && !Number.isNaN(v));
  if (!nums.length) return undefined;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

export function stdev(values) {
  const nums = values.filter((v) => v != null && !Number.isNaN(v));
  if (nums.length < 2) return undefined;
  const m = mean(nums);
  return Math.sqrt(nums.reduce((s, v) => s + (v - m) ** 2, 0) / (nums.length - 1));
}

export function formatClock(minutes) {
  if (minutes == null) return '—';
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

export function formatMetric(id, value, { units = 'metric', withUnit = true } = {}) {
  if (value == null || Number.isNaN(value)) return '—';
  const m = METRIC_BY_ID[id];
  if (id === 'bedtime') return formatClock(value);
  if (id === 'sleepHours') {
    const h = Math.floor(value);
    const min = Math.round((value - h) * 60);
    if (min === 60) return `${h + 1}h 0m`;
    return h ? `${h}h ${min}m` : `${min}m`;
  }
  let v = value;
  let unit = m?.unit || '';
  if (id === 'weight' && units === 'imperial') {
    v = value * 2.20462;
    unit = 'lb';
  }
  const text = v.toLocaleString(undefined, {
    maximumFractionDigits: m?.decimals ?? 0,
    minimumFractionDigits: m?.decimals ?? 0,
  });
  return withUnit && unit ? `${text} ${unit}` : text;
}
