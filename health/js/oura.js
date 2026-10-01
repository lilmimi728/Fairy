// Oura API v2. Personal access tokens are deprecated, so this uses Oura's client-side
// OAuth flow (response_type=token): no server needed, tokens last ~30 days.
// Register an app at https://cloud.ouraring.com/oauth/applications with this page's URL
// as the redirect URI.

const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const API_BASE = 'https://api.ouraring.com';
const SCOPES = 'personal daily heartrate workout session';

export function redirectUri() {
  return location.origin + location.pathname;
}

export function startOuraLogin(clientId) {
  const state = crypto.randomUUID();
  sessionStorage.setItem('oura_oauth_state', state);
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
  });
  location.href = `${AUTHORIZE_URL}?${params}`;
}

/** If we just came back from Oura, pull the token out of the URL fragment. */
export function consumeOuraRedirect() {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const expected = sessionStorage.getItem('oura_oauth_state');
  sessionStorage.removeItem('oura_oauth_state');
  if (p.get('error')) return { error: p.get('error_description') || p.get('error') };
  if (!expected || p.get('state') !== expected) return { error: 'Oura sign-in state mismatch. Try connecting again.' };
  const expiresIn = Number(p.get('expires_in')) || 30 * 86400;
  return { token: p.get('access_token'), expiresAt: Date.now() + expiresIn * 1000 };
}

async function fetchCollection(path, { token, proxy, start, end }) {
  const out = [];
  let next = null;
  do {
    const params = new URLSearchParams({ start_date: start, end_date: end });
    if (next) params.set('next_token', next);
    const base = proxy ? proxy.replace(/\/$/, '') : API_BASE;
    let res;
    try {
      res = await fetch(`${base}/v2/usercollection/${path}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error(
        'Could not reach Oura from the browser (likely blocked by CORS). Add the proxy URL in Settings — see health/proxy/README.md.',
      );
    }
    if (res.status === 401) throw new Error('Oura token expired or revoked. Reconnect Oura in Settings.');
    if (res.status === 429) throw new Error('Oura rate limit hit. Try again in a few minutes.');
    if (!res.ok) throw new Error(`Oura ${path} failed (${res.status})`);
    const body = await res.json();
    out.push(...(body.data || []));
    next = body.next_token;
  } while (next);
  return out;
}

/** Bedtime as minutes from midnight; times before noon after midnight stay positive, evening is negative. */
export function bedtimeMinutes(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return undefined;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 12 * 60 ? minutes - 1440 : minutes;
}

/** Turn raw Oura collections into { days, workouts } in the app's shape. Pure, for testing. */
export function normalizeOura({ dailySleep = [], readiness = [], activity = [], sleep = [], workouts = [] }) {
  const days = {};
  const day = (k) => (days[k] ||= {});
  for (const d of dailySleep) if (d.score != null) day(d.day).sleepScore = d.score;
  for (const d of readiness) if (d.score != null) day(d.day).readiness = d.score;
  for (const d of activity) {
    const t = day(d.day);
    if (d.steps != null) t.steps = d.steps;
    if (d.active_calories != null) t.activeCal = d.active_calories;
    if (d.score != null) t.activityScore = d.score;
  }
  // Detailed sleep periods: use the main (longest) sleep of each day.
  const main = {};
  for (const s of sleep) {
    if (s.type && !['long_sleep', 'sleep'].includes(s.type)) continue;
    if (!main[s.day] || (s.total_sleep_duration || 0) > (main[s.day].total_sleep_duration || 0)) main[s.day] = s;
  }
  for (const [k, s] of Object.entries(main)) {
    const t = day(k);
    if (s.total_sleep_duration != null) t.sleepHours = Math.round((s.total_sleep_duration / 3600) * 100) / 100;
    if (s.average_hrv != null) t.hrv = s.average_hrv;
    if (s.lowest_heart_rate != null) t.rhr = s.lowest_heart_rate;
    const bt = bedtimeMinutes(s.bedtime_start);
    if (bt != null) t.bedtime = bt;
  }
  const outWorkouts = workouts.map((w) => {
    const start = Date.parse(w.start_datetime);
    const end = Date.parse(w.end_datetime);
    const name = (w.activity || 'workout').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    return {
      id: `oura:${w.id || start}`,
      date: w.day,
      start,
      name,
      minutes: end > start ? Math.round((end - start) / 60000) : undefined,
      calories: w.calories != null ? Math.round(w.calories) : undefined,
      source: 'oura',
    };
  });
  return { days, workouts: outWorkouts };
}

/** Fetch and normalise Oura data for [start, end] (inclusive day keys). */
export async function syncOura({ token, proxy, start, end }) {
  const opts = { token, proxy, start, end };
  // The detailed sleep endpoint treats end_date as exclusive; widen by a day.
  const endPlus = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10);
  const [dailySleep, readiness, activity, sleep, workouts] = await Promise.all([
    fetchCollection('daily_sleep', opts),
    fetchCollection('daily_readiness', opts),
    fetchCollection('daily_activity', opts),
    fetchCollection('sleep', { ...opts, end: endPlus }),
    fetchCollection('workout', opts),
  ]);
  return normalizeOura({ dailySleep, readiness, activity, sleep, workouts });
}
