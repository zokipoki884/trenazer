// Workout profile chart on <canvas>: zone-coloured blocks, played part dimmed,
// actual power line and a position marker.
import { zoneFor } from './zones.js';
import { totalDuration } from '../workout/model.js';

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function drawChart(canvas, workout, elapsed, actual, ftpWatts) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const total = totalDuration(workout) || 1;
  const maxF = Math.max(1.2, ...workout.steps.map((s) => Math.max(s.power, s.powerEnd ?? 0))) * 1.08;
  const topPad = 10;
  const x = (t) => (t / total) * w;
  const y = (f) => h - (f / maxF) * (h - topPad);
  const gap = Math.min(1.5, w / total / 2);

  // Blocks
  let t = 0;
  for (const st of workout.steps) {
    const f0 = st.power;
    const f1 = st.powerEnd ?? st.power;
    const x0 = x(t) + (t > 0 ? gap / 2 : 0);
    const x1 = x(t + st.duration) - gap / 2;
    ctx.fillStyle = zoneFor((f0 + f1) / 2).color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(x0, h);
    ctx.lineTo(x0, y(f0));
    ctx.lineTo(x1, y(f1));
    ctx.lineTo(x1, h);
    ctx.closePath();
    ctx.fill();
    t += st.duration;
  }
  ctx.globalAlpha = 1;

  // Played area: light overlay
  const px = x(Math.min(elapsed, total));
  ctx.fillStyle = css('--card');
  ctx.globalAlpha = 0.6;
  ctx.fillRect(0, 0, px, h);
  ctx.globalAlpha = 1;

  // FTP line
  ctx.strokeStyle = css('--line');
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y(1));
  ctx.lineTo(w, y(1));
  ctx.stroke();
  ctx.setLineDash([]);

  // Actual power line
  if (actual.length > 1 && ftpWatts > 0) {
    ctx.strokeStyle = css('--actual');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    actual.forEach((p, i) => {
      const yy = Math.max(1, y(p.w / ftpWatts));
      i ? ctx.lineTo(x(p.t), yy) : ctx.moveTo(x(p.t), yy);
    });
    ctx.stroke();
  }

  // Marker
  ctx.fillStyle = css('--text');
  ctx.fillRect(px - 1.5, 6, 3, h - 6);
  ctx.beginPath();
  ctx.arc(px, 7, 6, 0, Math.PI * 2);
  ctx.fill();
}
