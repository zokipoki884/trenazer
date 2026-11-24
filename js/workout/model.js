// Workout format:
// { name, steps: [{ name, duration (s), power (fraction of FTP), powerEnd? (for ramps) }] }

/** Converts steps given in absolute watts into fractions of the given FTP. */
export function resolveWorkout(workout, ftp) {
  return {
    ...workout,
    steps: workout.steps.map((s) =>
      s.watts == null
        ? s
        : { ...s, power: s.watts / ftp, powerEnd: s.wattsEnd == null ? undefined : s.wattsEnd / ftp }
    ),
  };
}

export function totalDuration(workout) {
  return workout.steps.reduce((s, st) => s + st.duration, 0);
}

/** Returns info about the step active at time t (seconds since start). */
export function stepAt(workout, t) {
  let start = 0;
  const steps = workout.steps;
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (t < start + st.duration || i === steps.length - 1) {
      const inStep = Math.min(Math.max(t - start, 0), st.duration);
      return {
        index: i,
        step: st,
        start,
        inStep,
        remaining: st.duration - inStep,
        next: steps[i + 1] || null,
      };
    }
    start += st.duration;
  }
  return null;
}

/** Target fraction of FTP at a given position inside a step (handles ramps). */
export function fractionAt(step, inStep) {
  if (step.powerEnd == null || step.duration <= 0) return step.power;
  const p = Math.min(Math.max(inStep / step.duration, 0), 1);
  return step.power + (step.powerEnd - step.power) * p;
}

/** Representative fraction of a step (average for ramps). */
export function stepFraction(step) {
  return step.powerEnd == null ? step.power : (step.power + step.powerEnd) / 2;
}

/** Planned TSS and IF of a (resolved) workout, if ridden exactly on target. */
export function workoutStats(workout) {
  const f = [];
  for (const st of workout.steps) {
    for (let k = 0; k < st.duration; k++) f.push(fractionAt(st, k + 0.5));
  }
  if (!f.length) return { tss: 0, ifactor: 0 };
  // Normalized power (as fraction of FTP): 30 s rolling average, 4th-power mean.
  let sum = 0;
  let acc = 0;
  let cnt = 0;
  for (let i = 0; i < f.length; i++) {
    sum += f[i];
    if (i >= 30) sum -= f[i - 30];
    if (i >= 29) { acc += (sum / Math.min(30, i + 1)) ** 4; cnt++; }
  }
  const ifactor = cnt ? (acc / cnt) ** 0.25 : f.reduce((s, v) => s + v, 0) / f.length;
  return { ifactor, tss: (f.length / 3600) * ifactor * ifactor * 100 };
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
