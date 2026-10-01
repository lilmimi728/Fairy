// Apple Health import. iPhone: Health app → profile picture → Export All Health Data.
// That produces export.zip containing apple_health_export/export.xml, which can be
// gigabytes, so both the zip and the XML are streamed — nothing is held in memory whole.
//
// When this app is wrapped for iOS (Capacitor), a HealthKit source replaces this
// module and returns the same { days, workouts } shape.

const SUM_TYPES = {
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'activeCal',
  HKQuantityTypeIdentifierAppleExerciseTime: 'exerciseMin',
};
const AVG_TYPES = {
  HKQuantityTypeIdentifierRestingHeartRate: 'rhr',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
};
const LAST_TYPES = { HKQuantityTypeIdentifierBodyMass: 'weight' };
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';
const ASLEEP = /^HKCategoryValueSleepAnalysisAsleep/;

/** "2024-01-15 07:30:00 -0500" → epoch ms */
export function parseHealthDate(s) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/.exec(s);
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : Date.parse(s);
}

function parseAttrs(tag) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1]] = m[2];
  return attrs;
}

const decodeEntities = (s) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]);

export function prettyWorkoutType(t = '') {
  return (
    t
      .replace(/^HKWorkoutActivityType/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^Traditional /, '')
      .replace(/^Functional Strength Training$/, 'Functional Strength') || 'Workout'
  );
}

/**
 * Streaming parser for export.xml. Feed text chunks with push(); call finish() for results.
 * Only records on/after `sinceKey` are kept.
 */
export class HealthXmlParser {
  constructor({ sinceKey = '0000-00-00' } = {}) {
    this.sinceKey = sinceKey;
    this.buf = '';
    this.sums = {}; // metric -> day -> source -> total
    this.avgs = {}; // metric -> day -> [sum, count]
    this.lasts = {}; // metric -> day -> [time, value]
    this.sleep = {}; // day -> source -> minutes
    this.workouts = [];
    this.current = null; // open <Workout> element
    this.records = 0;
  }

  push(text) {
    this.buf += text;
    let pos = 0;
    for (;;) {
      const lt = this.buf.indexOf('<', pos);
      if (lt === -1) {
        pos = this.buf.length;
        break;
      }
      const gt = this.buf.indexOf('>', lt);
      if (gt === -1) {
        pos = lt;
        break;
      }
      this.handleTag(this.buf.slice(lt + 1, gt));
      pos = gt + 1;
    }
    this.buf = this.buf.slice(pos);
  }

  handleTag(tag) {
    const c = tag.charCodeAt(0);
    if (c === 82 /* R */ && tag.startsWith('Record ')) return this.handleRecord(tag);
    if (c === 87 /* W */) {
      if (tag.startsWith('Workout ')) return this.openWorkout(tag);
      if (tag.startsWith('WorkoutStatistics ') && this.current) return this.workoutStat(tag);
    }
    if (c === 47 /* / */ && tag === '/Workout' && this.current) {
      this.workouts.push(this.current);
      this.current = null;
    }
  }

  handleRecord(tag) {
    const ti = tag.indexOf('type="');
    if (ti === -1) return;
    const type = tag.slice(ti + 6, tag.indexOf('"', ti + 6));
    if (!(type in SUM_TYPES || type in AVG_TYPES || type in LAST_TYPES || type === SLEEP_TYPE)) return;
    const a = parseAttrs(tag);
    const day = (type === SLEEP_TYPE ? a.endDate : a.startDate)?.slice(0, 10);
    if (!day || day < this.sinceKey) return;
    this.records += 1;
    const source = a.sourceName || 'unknown';

    if (type === SLEEP_TYPE) {
      if (!ASLEEP.test(a.value || '')) return;
      const minutes = (parseHealthDate(a.endDate) - parseHealthDate(a.startDate)) / 60000;
      if (!(minutes > 0)) return;
      const d = (this.sleep[day] ||= {});
      d[source] = (d[source] || 0) + minutes;
      return;
    }
    let value = parseFloat(a.value);
    if (Number.isNaN(value)) return;
    if (type in SUM_TYPES) {
      if (a.unit === 'kJ') value /= 4.184;
      const metric = SUM_TYPES[type];
      const d = ((this.sums[metric] ||= {})[day] ||= {});
      d[source] = (d[source] || 0) + value;
    } else if (type in AVG_TYPES) {
      const metric = AVG_TYPES[type];
      const d = ((this.avgs[metric] ||= {})[day] ||= [0, 0]);
      d[0] += value;
      d[1] += 1;
    } else {
      if (a.unit === 'lb') value /= 2.20462;
      const metric = LAST_TYPES[type];
      const t = parseHealthDate(a.startDate);
      const days = (this.lasts[metric] ||= {});
      if (!days[day] || t >= days[day][0]) days[day] = [t, value];
    }
  }

  openWorkout(tag) {
    const selfClosing = tag.endsWith('/');
    const a = parseAttrs(tag);
    const date = a.startDate?.slice(0, 10);
    if (!date || date < this.sinceKey) {
      this.current = selfClosing ? null : { skip: true };
      return;
    }
    let minutes = parseFloat(a.duration);
    if (a.durationUnit === 'h' || a.durationUnit === 'hr') minutes *= 60;
    else if (a.durationUnit === 's') minutes /= 60;
    let calories = parseFloat(a.totalEnergyBurned);
    if (a.totalEnergyBurnedUnit === 'kJ') calories /= 4.184;
    const start = parseHealthDate(a.startDate);
    const w = {
      id: `apple:${start}`,
      date,
      start,
      name: prettyWorkoutType(a.workoutActivityType),
      minutes: Number.isNaN(minutes) ? undefined : Math.round(minutes),
      calories: Number.isNaN(calories) ? undefined : Math.round(calories),
      sourceName: decodeEntities(a.sourceName || ''),
      source: 'apple',
    };
    if (selfClosing) this.workouts.push(w);
    else this.current = w;
  }

  workoutStat(tag) {
    if (this.current.skip) return;
    const a = parseAttrs(tag);
    if (a.type === 'HKQuantityTypeIdentifierActiveEnergyBurned' && this.current.calories == null) {
      let cal = parseFloat(a.sum);
      if (a.unit === 'kJ') cal /= 4.184;
      if (!Number.isNaN(cal)) this.current.calories = Math.round(cal);
    }
  }

  /** Returns { days: { key: { steps, activeCal, ... } }, workouts: [...] } */
  finish() {
    const days = {};
    const set = (day, metric, v) => ((days[day] ||= {})[metric] = v);
    // Phone and watch both record steps/energy; the richest single source avoids double counting.
    for (const [metric, byDay] of Object.entries(this.sums)) {
      for (const [day, bySource] of Object.entries(byDay)) set(day, metric, Math.round(Math.max(...Object.values(bySource))));
    }
    for (const [metric, byDay] of Object.entries(this.avgs)) {
      for (const [day, [sum, n]] of Object.entries(byDay)) set(day, metric, Math.round((sum / n) * 10) / 10);
    }
    for (const [metric, byDay] of Object.entries(this.lasts)) {
      for (const [day, [, v]] of Object.entries(byDay)) set(day, metric, Math.round(v * 10) / 10);
    }
    for (const [day, bySource] of Object.entries(this.sleep)) {
      set(day, 'sleepHours', Math.round((Math.max(...Object.values(bySource)) / 60) * 100) / 100);
    }
    return { days, workouts: this.workouts.filter((w) => !w.skip), records: this.records };
  }
}

// ---------- zip handling (no library: central directory + DecompressionStream) ----------

async function readBytes(file, start, length) {
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

/** Locate export.xml in the zip's central directory. */
export async function findZipEntry(file, nameSuffix = 'export.xml') {
  const tailLen = Math.min(file.size, 66000);
  const tail = await readBytes(file, file.size - tailLen, tailLen);
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Not a valid zip file');
  let cdSize = dv.getUint32(eocd + 12, true);
  let cdOffset = dv.getUint32(eocd + 16, true);
  // ZIP64: the locator sits just before the EOCD record.
  if (cdOffset === 0xffffffff && eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064b50) {
    const z64Off = Number(dv.getBigUint64(eocd - 20 + 8, true));
    const z64 = new DataView((await readBytes(file, z64Off, 56)).buffer);
    cdSize = Number(z64.getBigUint64(40, true));
    cdOffset = Number(z64.getBigUint64(48, true));
  }
  const cd = await readBytes(file, cdOffset, cdSize);
  const cv = new DataView(cd.buffer);
  const dec = new TextDecoder();
  for (let p = 0; p + 46 <= cd.length && cv.getUint32(p, true) === 0x02014b50; ) {
    const method = cv.getUint16(p + 10, true);
    let compSize = cv.getUint32(p + 20, true);
    let size = cv.getUint32(p + 24, true);
    const nameLen = cv.getUint16(p + 28, true);
    const extraLen = cv.getUint16(p + 30, true);
    const commentLen = cv.getUint16(p + 32, true);
    let localOffset = cv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extra field carries the real 64-bit values for any field set to 0xFFFFFFFF.
    for (let e = p + 46 + nameLen; e + 4 <= p + 46 + nameLen + extraLen; ) {
      const id = cv.getUint16(e, true);
      const len = cv.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff) (size = Number(cv.getBigUint64(q, true))), (q += 8);
        if (compSize === 0xffffffff) (compSize = Number(cv.getBigUint64(q, true))), (q += 8);
        if (localOffset === 0xffffffff) localOffset = Number(cv.getBigUint64(q, true));
      }
      e += 4 + len;
    }
    if (name.endsWith(nameSuffix) && !name.includes('__MACOSX')) {
      const local = new DataView((await readBytes(file, localOffset, 30)).buffer);
      const dataStart = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      return { name, method, compSize, size, dataStart };
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`No ${nameSuffix} found in this zip. Is it the Apple Health export?`);
}

/** Text stream of export.xml from either the raw XML file or the export zip. */
export async function openExportStream(file) {
  const isZip = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (isZip[0] === 0x50 && isZip[1] === 0x4b) {
    const entry = await findZipEntry(file);
    const raw = file.slice(entry.dataStart, entry.dataStart + entry.compSize).stream();
    let bytes;
    if (entry.method === 0) bytes = raw;
    else if (entry.method === 8) bytes = raw.pipeThrough(new DecompressionStream('deflate-raw'));
    else throw new Error(`Unsupported zip compression (method ${entry.method})`);
    return { stream: bytes.pipeThrough(new TextDecoderStream()), totalBytes: entry.compSize, rawSize: entry.size };
  }
  return { stream: file.stream().pipeThrough(new TextDecoderStream()), totalBytes: file.size, rawSize: file.size };
}

/**
 * Import an Apple Health export (zip or xml). onProgress receives 0..1.
 * Returns { days, workouts, records }.
 */
export async function importAppleHealth(file, { sinceKey, onProgress } = {}) {
  const { stream, rawSize } = await openExportStream(file);
  const parser = new HealthXmlParser({ sinceKey });
  const reader = stream.getReader();
  let seen = 0;
  let lastReport = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.push(value);
    seen += value.length; // characters ≈ bytes for this ASCII-heavy file
    if (onProgress && seen - lastReport > 4_000_000) {
      lastReport = seen;
      onProgress(Math.min(0.99, seen / rawSize));
      await new Promise((r) => setTimeout(r)); // let the UI paint
    }
  }
  onProgress?.(1);
  return parser.finish();
}
