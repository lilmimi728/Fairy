// Tiny inline-SVG sparkline: one series in a recessive ink, the latest point in the accent.

export function sparkline(values, { width = 96, height = 28, label = '' } = {}) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && !Number.isNaN(v));
  if (pts.length < 2) return `<svg class="spark" width="${width}" height="${height}" aria-hidden="true"></svg>`;
  const ys = pts.map(([, v]) => v);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const pad = 4;
  const x = (i) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
  const y = (v) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const [li, lv] = pts[pts.length - 1];
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
    <path d="${d}" fill="none" stroke="var(--spark)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(li).toFixed(1)}" cy="${y(lv).toFixed(1)}" r="3" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
  </svg>`;
}

/** Horizontal meter: value toward a target. */
export function meter(value, target, { tone } = {}) {
  const ratio = target ? Math.max(0, Math.min(1, (value || 0) / target)) : 0;
  const t = tone || (ratio >= 1 ? 'good' : ratio >= 0.6 ? 'accent' : 'warning');
  return `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${value ?? 0}">
    <span class="meter-fill tone-${t}" style="width:${(ratio * 100).toFixed(1)}%"></span>
  </div>`;
}
