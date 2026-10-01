import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthXmlParser, importAppleHealth, parseHealthDate, prettyWorkoutType } from '../js/apple-health.js';
import { EXPORT_XML } from './fixtures.mjs';

function check(result) {
  const d = result.days['2026-09-28'];
  assert.equal(d.steps, 8200, 'takes the richest source instead of double counting phone + watch');
  assert.equal(d.activeCal, 500, 'kJ converted to kcal');
  assert.equal(d.rhr, 54);
  assert.equal(d.weight, 78);
  assert.equal(d.sleepHours, 7.5, 'asleep stages only, attributed to wake day; in-bed ignored');
  assert.equal(result.days['2025-01-01'], undefined, 'records before sinceKey are skipped');
  assert.equal(result.workouts.length, 2);
  const strength = result.workouts.find((w) => w.date === '2026-09-28');
  assert.equal(strength.name, 'Strength Training');
  assert.equal(strength.minutes, 53);
  assert.equal(strength.calories, 310);
  const run = result.workouts.find((w) => w.date === '2026-09-27');
  assert.deepEqual([run.name, run.minutes, run.calories], ['Running', 30, 300]);
}

test('parses export.xml regardless of how it is chunked', () => {
  for (const size of [7, 64, 1000, EXPORT_XML.length]) {
    const p = new HealthXmlParser({ sinceKey: '2026-01-01' });
    for (let i = 0; i < EXPORT_XML.length; i += size) p.push(EXPORT_XML.slice(i, i + size));
    check(p.finish());
  }
});

test('streams export.xml out of the Apple Health zip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-'));
  writeFileSync(join(dir, 'export.xml'), EXPORT_XML);
  const zipPath = join(dir, 'export.zip');
  execFileSync('python3', ['-c', `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('apple_health_export/export_cda.xml', '<x/>')
    z.write(sys.argv[2], 'apple_health_export/export.xml')
`, zipPath, join(dir, 'export.xml')]);
  const file = new File([readFileSync(zipPath)], 'export.zip');
  const progress = [];
  const result = await importAppleHealth(file, { sinceKey: '2026-01-01', onProgress: (p) => progress.push(p) });
  check(result);
  assert.equal(progress.at(-1), 1);
});

test('also accepts a bare export.xml file', async () => {
  const result = await importAppleHealth(new File([EXPORT_XML], 'export.xml'), { sinceKey: '2026-01-01' });
  check(result);
});

test('helpers', () => {
  assert.equal(parseHealthDate('2026-09-28 07:30:00 -0700'), Date.parse('2026-09-28T14:30:00Z'));
  assert.equal(prettyWorkoutType('HKWorkoutActivityTypeHighIntensityIntervalTraining'), 'High Intensity Interval Training');
});
